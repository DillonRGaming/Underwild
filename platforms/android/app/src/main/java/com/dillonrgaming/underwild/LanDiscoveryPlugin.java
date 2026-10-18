package com.dillonrgaming.underwild;

import android.content.Context;
import android.net.wifi.WifiManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

// Finds Underwild games on the Wi-Fi: hosts (the desktop app) broadcast a small JSON
// message on UDP port 47778 every second (see mpMain.js). Each one heard is passed to the
// page as a "host" event; src/platform/webPlatform.js turns them into the game list.
@CapacitorPlugin(name = "LanDiscovery")
public class LanDiscoveryPlugin extends Plugin {
    private static final int DISCOVERY_PORT = 47778;

    private DatagramSocket socket;
    private Thread thread;
    private Thread askThread;
    private WifiManager.MulticastLock lock;

    @PluginMethod
    public void start(PluginCall call) {
        if (thread != null) {
            call.resolve();
            return;
        }
        try {
            // Android drops broadcast packets to save battery unless an app asks for them.
            WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                lock = wifi.createMulticastLock("underwild-discovery");
                lock.setReferenceCounted(false);
                lock.acquire();
            }
            socket = new DatagramSocket(null);
            socket.setReuseAddress(true);
            socket.setBroadcast(true);
            socket.bind(new InetSocketAddress(DISCOVERY_PORT));
        } catch (Exception e) {
            stopAll();
            call.reject("Could not listen for games: " + e.getMessage());
            return;
        }
        final DatagramSocket s = socket;
        thread = new Thread(() -> {
            byte[] buf = new byte[4096];
            while (!Thread.currentThread().isInterrupted() && !s.isClosed()) {
                try {
                    DatagramPacket packet = new DatagramPacket(buf, buf.length);
                    s.receive(packet);
                    JSObject ev = new JSObject();
                    ev.put("data", new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8));
                    ev.put("address", packet.getAddress().getHostAddress());
                    notifyListeners("host", ev);
                } catch (Exception e) {
                    if (s.isClosed()) break;
                }
            }
        }, "underwild-discovery");
        thread.start();
        // Also ask hosts to answer directly (a phone host's own broadcasts can go missing).
        final byte[] probe = "{\"game\":\"underwild\",\"query\":1}".getBytes(StandardCharsets.UTF_8);
        askThread = new Thread(() -> {
            while (!Thread.currentThread().isInterrupted() && !s.isClosed()) {
                try {
                    s.send(new DatagramPacket(probe, probe.length, java.net.InetAddress.getByName("255.255.255.255"), DISCOVERY_PORT));
                    for (java.net.NetworkInterface nif : java.util.Collections.list(java.net.NetworkInterface.getNetworkInterfaces())) {
                        if (!nif.isUp() || nif.isLoopback()) continue;
                        for (java.net.InterfaceAddress ia : nif.getInterfaceAddresses()) {
                            if (ia.getBroadcast() != null) s.send(new DatagramPacket(probe, probe.length, ia.getBroadcast(), DISCOVERY_PORT));
                        }
                    }
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    break;
                } catch (Exception e) {
                    if (s.isClosed()) break;
                }
            }
        }, "underwild-ask");
        askThread.start();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopAll();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopAll();
    }

    private void stopAll() {
        if (thread != null) thread.interrupt();
        thread = null;
        if (askThread != null) askThread.interrupt();
        askThread = null;
        if (socket != null) socket.close();
        socket = null;
        if (lock != null && lock.isHeld()) lock.release();
        lock = null;
    }
}
