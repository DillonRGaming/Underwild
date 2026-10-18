package com.dillonrgaming.underwild;

import android.content.Context;
import android.content.Intent;
import android.net.wifi.WifiManager;
import android.view.WindowManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

// Lets the phone host a game: a WebSocket server the guests connect to (the same protocol the
// desktop host speaks on its WebSocket port) and a UDP broadcast so guests see the game in
// their list. The game logic stays in the page (src/multiplayer.js); this only moves message
// strings, like platforms/desktop/multiplayerServer.js. Events to the page: guestConnect,
// guestMessage, guestDisconnect.
@CapacitorPlugin(name = "LanHost")
public class LanHostPlugin extends Plugin {
    private static final int DISCOVERY_PORT = 47778;

    private WebSocketServer server;
    private final Map<Integer, WebSocket> clients = new ConcurrentHashMap<>();
    private final Map<WebSocket, Integer> ids = new ConcurrentHashMap<>();
    private final AtomicInteger nextId = new AtomicInteger(1);

    private Thread announceThread;
    private Thread listenThread;
    private DatagramSocket listenSocket;
    private WifiManager.MulticastLock multicastLock;
    private volatile String announceInfo;

    @PluginMethod
    public void startHost(PluginCall call) {
        stopServer();
        int first = call.getInt("port", 47777);
        String error = "Could not start the game.";
        // The page's game port is p; the WebSocket lives on p + 1 like on the desktop.
        for (int attempt = 0, p = first; attempt < 6; attempt++, p += 2) {
            final CountDownLatch started = new CountDownLatch(1);
            final boolean[] failed = {false};
            final String[] message = {null};
            WebSocketServer s = new WebSocketServer(new InetSocketAddress(p + 1)) {
                @Override public void onStart() { started.countDown(); }
                @Override public void onOpen(WebSocket conn, ClientHandshake handshake) {
                    int id = nextId.getAndIncrement();
                    clients.put(id, conn);
                    ids.put(conn, id);
                    JSObject ev = new JSObject();
                    ev.put("id", id);
                    InetSocketAddress remote = conn.getRemoteSocketAddress();
                    ev.put("address", remote != null && remote.getAddress() != null ? remote.getAddress().getHostAddress() : "");
                    notifyListeners("guestConnect", ev);
                }
                @Override public void onClose(WebSocket conn, int code, String reason, boolean remote) {
                    Integer id = ids.remove(conn);
                    if (id == null) return;
                    clients.remove(id);
                    JSObject ev = new JSObject();
                    ev.put("id", id);
                    notifyListeners("guestDisconnect", ev);
                }
                @Override public void onMessage(WebSocket conn, String data) {
                    Integer id = ids.get(conn);
                    if (id == null) return;
                    JSObject ev = new JSObject();
                    ev.put("id", id);
                    ev.put("data", data);
                    notifyListeners("guestMessage", ev);
                }
                @Override public void onError(WebSocket conn, Exception ex) {
                    if (conn == null) {   // the server itself failed (port in use...)
                        failed[0] = true;
                        message[0] = ex.getMessage();
                        started.countDown();
                    }
                }
            };
            s.setReuseAddr(true);
            s.setConnectionLostTimeout(20);
            s.start();
            boolean up = false;
            try { up = started.await(4, TimeUnit.SECONDS); } catch (InterruptedException e) {}
            if (up && !failed[0]) {
                server = s;
                startKeepAlive();
                JSObject res = new JSObject();
                res.put("ok", true);
                res.put("port", p);
                res.put("wsPort", p + 1);
                res.put("addresses", addressList());
                call.resolve(res);
                return;
            }
            if (message[0] != null) error = message[0];
            try { s.stop(100); } catch (Exception e) {}
        }
        JSObject res = new JSObject();
        res.put("ok", false);
        res.put("error", error);
        call.resolve(res);
    }

    @PluginMethod
    public void stopHost(PluginCall call) {
        stopServer();
        call.resolve();
    }

    // { data, all: true, except: id } or { data, id }
    @PluginMethod
    public void send(PluginCall call) {
        String data = call.getString("data");
        if (data != null) {
            if (call.getBoolean("all", false)) {
                int except = call.getInt("except", -1);
                for (Map.Entry<Integer, WebSocket> e : clients.entrySet()) {
                    if (e.getKey() != except) trySend(e.getValue(), data);
                }
            } else {
                WebSocket conn = clients.get(call.getInt("id", -1));
                if (conn != null) trySend(conn, data);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void kick(PluginCall call) {
        WebSocket conn = clients.get(call.getInt("id", -1));
        if (conn != null) conn.close();
        call.resolve();
    }

    // { info: "<json>" } starts / updates the broadcast, no info stops it.
    @PluginMethod
    public void announce(PluginCall call) {
        announceInfo = call.getString("info");
        if (announceInfo == null) stopAnnounce();
        else startAnnounce();
        call.resolve();
    }

    @PluginMethod
    public void addresses(PluginCall call) {
        JSObject res = new JSObject();
        res.put("addresses", addressList());
        call.resolve(res);
    }

    @Override
    protected void handleOnDestroy() {
        stopServer();
    }

    private void trySend(WebSocket conn, String data) {
        try { if (conn.isOpen()) conn.send(data); } catch (Exception e) {}
    }

    private void stopServer() {
        stopAnnounce();
        WebSocketServer s = server;
        server = null;
        clients.clear();
        ids.clear();
        if (s != null) {
            try { s.stop(200); } catch (Exception e) {}
            stopKeepAlive();
        }
    }

    // --- Keeping the game running while hosting -----------------------------------------

    private void startKeepAlive() {
        try {
            ContextCompat.startForegroundService(getContext(), new Intent(getContext(), HostService.class));
        } catch (Exception e) {}
        getActivity().runOnUiThread(() ->
            getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
    }

    private void stopKeepAlive() {
        try { getContext().stopService(new Intent(getContext(), HostService.class)); } catch (Exception e) {}
        getActivity().runOnUiThread(() ->
            getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
    }

    // --- Announcing the game on the network ---------------------------------------------

    private List<InetAddress> broadcastTargets() {
        List<InetAddress> out = new ArrayList<>();
        try {
            out.add(InetAddress.getByName("255.255.255.255"));
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback()) continue;
                for (InterfaceAddress ia : nif.getInterfaceAddresses()) {
                    if (ia.getBroadcast() != null) out.add(ia.getBroadcast());
                }
            }
        } catch (Exception e) {}
        return out;
    }

    private JSArray addressList() {
        JSArray list = new JSArray();
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback()) continue;
                for (InetAddress a : Collections.list(nif.getInetAddresses())) {
                    if (a instanceof java.net.Inet4Address) list.put(a.getHostAddress());
                }
            }
        } catch (Exception e) {}
        return list;
    }

    private synchronized void startAnnounce() {
        if (announceThread != null) return;
        announceThread = new Thread(() -> {
            DatagramSocket socket = null;
            try {
                socket = new DatagramSocket();
                socket.setBroadcast(true);
                while (!Thread.currentThread().isInterrupted()) {
                    String info = announceInfo;
                    if (info != null) {
                        byte[] bytes = info.getBytes(StandardCharsets.UTF_8);
                        for (InetAddress target : broadcastTargets()) {
                            try { socket.send(new DatagramPacket(bytes, bytes.length, target, DISCOVERY_PORT)); }
                            catch (Exception e) {}
                        }
                    }
                    Thread.sleep(1000);
                }
            } catch (Exception e) {
                // interrupted or no network
            } finally {
                if (socket != null) socket.close();
            }
        }, "underwild-announce");
        announceThread.start();
        startListening();
    }

    // Browsing computers ask "who is hosting?" with a broadcast; answer them directly.
    private void startListening() {
        try {
            WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                multicastLock = wifi.createMulticastLock("underwild-host");
                multicastLock.setReferenceCounted(false);
                multicastLock.acquire();
            }
            listenSocket = new DatagramSocket(null);
            listenSocket.setReuseAddress(true);
            listenSocket.setBroadcast(true);
            listenSocket.bind(new InetSocketAddress(DISCOVERY_PORT));
        } catch (Exception e) {
            stopListening();
            return;
        }
        final DatagramSocket s = listenSocket;
        listenThread = new Thread(() -> {
            byte[] buf = new byte[2048];
            while (!Thread.currentThread().isInterrupted() && !s.isClosed()) {
                try {
                    DatagramPacket packet = new DatagramPacket(buf, buf.length);
                    s.receive(packet);
                    String msg = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
                    String info = announceInfo;
                    if (info != null && msg.contains("\"query\"")) {
                        byte[] bytes = info.getBytes(StandardCharsets.UTF_8);
                        s.send(new DatagramPacket(bytes, bytes.length, packet.getAddress(), DISCOVERY_PORT));
                    }
                } catch (Exception e) {
                    if (s.isClosed()) break;
                }
            }
        }, "underwild-answer");
        listenThread.start();
    }

    private synchronized void stopListening() {
        if (listenThread != null) listenThread.interrupt();
        listenThread = null;
        if (listenSocket != null) listenSocket.close();
        listenSocket = null;
        if (multicastLock != null && multicastLock.isHeld()) multicastLock.release();
        multicastLock = null;
    }

    private synchronized void stopAnnounce() {
        announceInfo = null;
        if (announceThread != null) announceThread.interrupt();
        announceThread = null;
        stopListening();
    }
}
