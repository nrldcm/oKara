package com.okara.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * The on-disk song library for Android. Imports are copied (streamed
 * natively, no bytes over the JS bridge) into one folder under the app's
 * external files dir; the app plays them back via Capacitor file URLs. The
 * folder is user-visible over USB and survives app updates.
 */
@CapacitorPlugin(name = "Library")
public class LibraryPlugin extends Plugin {

    private File libraryDir() {
        File dir = new File(getContext().getExternalFilesDir(null), "library");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    private boolean insideLibrary(File f) throws IOException {
        String lib = libraryDir().getCanonicalPath() + File.separator;
        return f.getCanonicalPath().startsWith(lib);
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("dir", libraryDir().getAbsolutePath());
        ret.put("canChooseDir", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void chooseDir(PluginCall call) {
        call.resolve(null); // fixed location on Android
    }

    @PluginMethod
    public void pickImport(PluginCall call) {
        String kind = call.getString("kind", "files");
        Intent intent;
        if ("folder".equals(kind)) {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        } else {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        startActivityForResult(call, intent, "pickImportResult");
    }

    @ActivityCallback
    private void pickImportResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSArray out = new JSArray();
        try {
            Intent data = result.getData();
            if (result.getResultCode() == android.app.Activity.RESULT_OK && data != null) {
                if (data.getData() != null && data.getClipData() == null
                        && "folder".equals(call.getString("kind", "files"))) {
                    DocumentFile tree = DocumentFile.fromTreeUri(getContext(), data.getData());
                    copyTree(tree, out);
                } else if (data.getClipData() != null) {
                    for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                        copyUri(data.getClipData().getItemAt(i).getUri(), null, out);
                    }
                } else if (data.getData() != null) {
                    copyUri(data.getData(), null, out);
                }
            }
            JSObject ret = new JSObject();
            ret.put("files", out);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Import failed", e);
        }
    }

    private void copyTree(DocumentFile dir, JSArray out) throws IOException {
        if (dir == null) return;
        for (DocumentFile child : dir.listFiles()) {
            if (child.isDirectory()) copyTree(child, out);
            else if (child.isFile()) copyUri(child.getUri(), child.getName(), out);
        }
    }

    private void copyUri(Uri uri, String knownName, JSArray out) throws IOException {
        String name = knownName != null ? knownName : displayName(uri);
        if (name == null || name.isEmpty()) name = "import-" + System.currentTimeMillis();
        File dest = uniqueDest(name);
        try (InputStream in = getContext().getContentResolver().openInputStream(uri);
             OutputStream os = new FileOutputStream(dest)) {
            if (in == null) return;
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) os.write(buf, 0, n);
        }
        JSObject entry = new JSObject();
        entry.put("name", dest.getName());
        entry.put("path", dest.getAbsolutePath());
        out.put(entry);
    }

    private File uniqueDest(String name) {
        File dir = libraryDir();
        File dest = new File(dir, name);
        int dot = name.lastIndexOf('.');
        String stem = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 2; dest.exists(); i++) {
            dest = new File(dir, stem + " (" + i + ")" + ext);
        }
        return dest;
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver()
                .query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
            // fall back to the URI's last segment
        }
        return uri.getLastPathSegment();
    }

    private void walk(File dir, List<File> out) {
        File[] items = dir.listFiles();
        if (items == null) return;
        for (File f : items) {
            if (f.isDirectory()) walk(f, out);
            else if (f.isFile()) out.add(f);
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        List<File> files = new ArrayList<>();
        walk(libraryDir(), files);
        JSArray out = new JSArray();
        for (File f : files) {
            JSObject entry = new JSObject();
            entry.put("name", f.getName());
            entry.put("path", f.getAbsolutePath());
            out.put(entry);
        }
        JSObject ret = new JSObject();
        ret.put("files", out);
        call.resolve(ret);
    }

    @PluginMethod
    public void readText(PluginCall call) {
        String path = call.getString("path");
        JSObject ret = new JSObject();
        try {
            File f = new File(path == null ? "" : path);
            if (path == null || !insideLibrary(f)) {
                ret.put("text", "");
            } else {
                byte[] bytes = new byte[(int) f.length()];
                try (InputStream in = new java.io.FileInputStream(f)) {
                    int off = 0;
                    while (off < bytes.length) {
                        int n = in.read(bytes, off, bytes.length - off);
                        if (n == -1) break;
                        off += n;
                    }
                }
                ret.put("text", new String(bytes, StandardCharsets.UTF_8));
            }
            call.resolve(ret);
        } catch (IOException e) {
            call.reject("Read failed", e);
        }
    }

    @PluginMethod
    public void deleteFiles(PluginCall call) {
        JSONArray paths = call.getArray("paths") != null ? call.getArray("paths") : new JSArray();
        try {
            for (int i = 0; i < paths.length(); i++) {
                File f = new File(paths.getString(i));
                if (insideLibrary(f)) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Delete failed", e);
        }
    }
}
