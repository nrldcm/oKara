package com.okara.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * Bridges the app (via the window.okara shim) to the LAN RemoteServer,
 * mirroring the IPC surface of electron/main.cjs: getPairing, sendState,
 * plus "command" and "remoteCount" events.
 */
@CapacitorPlugin(name = "RemoteServer")
public class RemoteServerPlugin extends Plugin {

    private RemoteServer server;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    public void load() {
        // Tell the app when Wi-Fi comes or goes so it can refresh the pairing
        // QR (the LAN IP changes). Hotspot toggles don't fire this callback,
        // so the app also re-polls while it has no network.
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                notifyListeners("networkChanged", new JSObject());
            }

            @Override
            public void onLost(Network network) {
                notifyListeners("networkChanged", new JSObject());
            }
        };
        try {
            cm.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception ignored) {
            // app still works, just without live network-change events
        }
    }

    private synchronized RemoteServer ensureServer() throws IOException {
        if (server == null) {
            RemoteServer created = new RemoteServer(readRemoteHtml(), new RemoteServer.Listener() {
                @Override
                public void onCommand(JSONObject cmd) {
                    JSObject data = new JSObject();
                    data.put("action", cmd.optString("action"));
                    if (cmd.has("value")) data.put("value", cmd.opt("value"));
                    notifyListeners("command", data);
                }

                @Override
                public void onCountChange(int count) {
                    JSObject data = new JSObject();
                    data.put("count", count);
                    notifyListeners("remoteCount", data);
                }
            });
            created.startServer();
            server = created;
        }
        return server;
    }

    private String readRemoteHtml() throws IOException {
        try (InputStream in = getContext().getAssets().open("remote.html");
             BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[8192];
            int n;
            while ((n = reader.read(buf)) != -1) sb.append(buf, 0, n);
            return sb.toString();
        }
    }

    @PluginMethod
    public void getPairing(PluginCall call) {
        try {
            RemoteServer s = ensureServer();
            JSObject ret = new JSObject();
            ret.put("url", s.getUrl());
            ret.put("token", s.getToken());
            ret.put("hasNetwork", s.hasNetwork());
            call.resolve(ret);
        } catch (IOException e) {
            call.reject("Failed to start remote server", e);
        }
    }

    @PluginMethod
    public void sendState(PluginCall call) {
        JSObject state = call.getObject("state");
        RemoteServer s = server;
        if (s != null && state != null) {
            s.broadcastState(state.toString());
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (networkCallback != null) {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                try { cm.unregisterNetworkCallback(networkCallback); } catch (Exception ignored) { /* not registered */ }
            }
            networkCallback = null;
        }
        RemoteServer s = server;
        if (s != null) {
            s.stopServer();
            server = null;
        }
    }
}
