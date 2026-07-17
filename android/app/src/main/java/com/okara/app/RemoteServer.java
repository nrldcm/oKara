package com.okara.app;

import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoWSD;

import org.json.JSONObject;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.Set;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Android port of electron/server.cjs: a LAN HTTP + WebSocket server that
 * serves the phone-remote page and relays commands/state, guarded by a
 * one-time pairing token embedded in the QR URL.
 */
public class RemoteServer extends NanoWSD {

    public interface Listener {
        void onCommand(JSONObject cmd);

        void onCountChange(int count);
    }

    private static final byte[] PING_PAYLOAD = new byte[0];

    private final String token;
    private final String remoteHtml;
    private final Listener listener;
    private final Set<RemoteSocket> clients = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final Timer pingTimer = new Timer("okara-remote-ping", true);
    private volatile String lastStateJson = null;

    public RemoteServer(String remoteHtml, Listener listener) {
        super(0); // ephemeral port, like server.listen(0) in Electron
        this.remoteHtml = remoteHtml;
        this.listener = listener;

        byte[] raw = new byte[24];
        new SecureRandom().nextBytes(raw);
        StringBuilder hex = new StringBuilder(raw.length * 2);
        for (byte b : raw) hex.append(String.format("%02x", b));
        this.token = hex.toString();
    }

    public void startServer() throws IOException {
        start(0, true); // no socket read timeout — WebSockets stay open, ping keeps them fresh
        pingTimer.schedule(new TimerTask() {
            @Override
            public void run() {
                for (RemoteSocket socket : clients) {
                    try {
                        socket.ping(PING_PAYLOAD);
                    } catch (IOException e) {
                        dropClient(socket);
                    }
                }
            }
        }, 25000, 25000);
    }

    public void stopServer() {
        pingTimer.cancel();
        stop();
    }

    public String getToken() {
        return token;
    }

    public String getUrl() {
        String ip = lanIp();
        return "http://" + (ip != null ? ip : "127.0.0.1") + ":" + getListeningPort() + "/?t=" + token;
    }

    /** True when a phone could actually reach this device (Wi-Fi or hotspot up). */
    public boolean hasNetwork() {
        return lanIp() != null;
    }

    public void broadcastState(String stateJson) {
        lastStateJson = stateJson;
        String payload = wrapState(stateJson);
        for (RemoteSocket socket : clients) {
            try {
                socket.send(payload);
            } catch (IOException e) {
                dropClient(socket);
            }
        }
    }

    private static String wrapState(String stateJson) {
        return "{\"type\":\"state\",\"state\":" + stateJson + "}";
    }

    private void dropClient(RemoteSocket socket) {
        if (clients.remove(socket)) {
            listener.onCountChange(clients.size());
        }
        try {
            socket.close(WebSocketFrame.CloseCode.GoingAway, "ping failed", false);
        } catch (IOException ignored) {
            // socket already dead
        }
    }

    /**
     * Reachable IPv4 of this device on Wi-Fi OR its own hotspot (interface
     * names like ap0/swlan0 — hotspot mode makes the remote work with no
     * router/internet at all). Null when there is no usable network.
     */
    private static String lanIp() {
        String fallback = null;
        try {
            for (NetworkInterface iface : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!iface.isUp() || iface.isLoopback()) continue;
                String name = iface.getName() == null ? "" : iface.getName();
                boolean preferred = name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("swlan");
                for (InetAddress addr : Collections.list(iface.getInetAddresses())) {
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress() && addr.isSiteLocalAddress()) {
                        if (preferred) return addr.getHostAddress();
                        if (fallback == null) fallback = addr.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) {
            // treated as no network
        }
        return fallback;
    }

    @Override
    protected Response serveHttp(IHTTPSession session) {
        String uri = session.getUri();
        if ("/".equals(uri) || "/remote".equals(uri)) {
            return NanoHTTPD.newFixedLengthResponse(Response.Status.OK, "text/html; charset=utf-8", remoteHtml);
        }
        return NanoHTTPD.newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "");
    }

    @Override
    protected WebSocket openWebSocket(IHTTPSession handshake) {
        boolean authorized = "/ws".equals(handshake.getUri())
                && token.equals(handshake.getParms().get("t"));
        return new RemoteSocket(handshake, authorized);
    }

    private class RemoteSocket extends WebSocket {
        private final boolean authorized;

        RemoteSocket(IHTTPSession handshakeRequest, boolean authorized) {
            super(handshakeRequest);
            this.authorized = authorized;
        }

        @Override
        protected void onOpen() {
            if (!authorized) {
                try {
                    close(WebSocketFrame.CloseCode.PolicyViolation, "bad token", false);
                } catch (IOException ignored) {
                    // nothing to clean up
                }
                return;
            }
            clients.add(this);
            listener.onCountChange(clients.size());
            String state = lastStateJson;
            if (state != null) {
                try {
                    send(wrapState(state));
                } catch (IOException e) {
                    dropClient(this);
                }
            }
        }

        @Override
        protected void onClose(WebSocketFrame.CloseCode code, String reason, boolean initiatedByRemote) {
            if (clients.remove(this)) {
                listener.onCountChange(clients.size());
            }
        }

        @Override
        protected void onMessage(WebSocketFrame message) {
            try {
                JSONObject msg = new JSONObject(message.getTextPayload());
                if ("cmd".equals(msg.optString("type"))) {
                    listener.onCommand(msg);
                }
            } catch (Exception ignored) {
                // malformed message — ignore, same as the Electron server
            }
        }

        @Override
        protected void onPong(WebSocketFrame pong) {
            // client is alive; nothing to do
        }

        @Override
        protected void onException(IOException exception) {
            dropClient(this);
        }
    }
}
