// LAN multiplayer networking for the Electron main process.
//
// The host's game opens a TCP server (one JSON message per line) and announces itself on
// the local network with UDP broadcasts every second, so guests see it in their list
// without typing an address. Next to it (on the port after) is a WebSocket server for the
// phone app, which can't open raw TCP sockets; both kinds of guest are treated the same. The game logic lives in the page (src/multiplayer.js); this
// file only moves message strings between the page and the sockets.

const net = require('net');
const dgram = require('dgram');
const os = require('os');
const { StringDecoder } = require('string_decoder');
let WebSocketServer = null;
let WebSocketClient = null;
try {
  ({ WebSocketServer, WebSocket: WebSocketClient } = require('ws'));
} catch (e) {}

const GAME_PORT = 47777; // first TCP port tried by a host
const DISCOVERY_PORT = 47778; // UDP port hosts announce on
const ANNOUNCE_MS = 1000;
const HOST_TIMEOUT_MS = 4000; // a host not heard from for this long leaves the list
const MAX_LINE = 64 * 1024 * 1024;

let send = () => {}; // (channel, payload) -> page

// --- Line framing --------------------------------------------------------------------

function lineReader(onLine) {
  let buf = '';
  const decoder = new StringDecoder('utf8'); // keeps multi-byte characters split across packets intact
  return (chunk) => {
    buf += decoder.write(chunk);
    if (buf.length > MAX_LINE) buf = '';
    let i;
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line) onLine(line);
    }
  };
}

// --- Host ----------------------------------------------------------------------------

let server = null;
let wsServer = null;
const clients = new Map(); // id -> { write(line), end(), destroy() }
let nextClientId = 1;
let announce = null; // { timer, socket, info }

function startHost(port = GAME_PORT) {
  stopHost();
  return new Promise((resolve) => {
    const tryPort = (p, attemptsLeft) => {
      const srv = net.createServer((socket) => {
        const id = nextClientId++;
        socket.setNoDelay(true);
        clients.set(id, socket);
        socket.on('error', () => {});
        send('mp:event', { type: 'guest-connect', id, address: socket.remoteAddress });
        socket.on(
          'data',
          lineReader((line) => send('mp:event', { type: 'message', id, data: line }))
        );
        const gone = () => {
          if (!clients.has(id)) return;
          clients.delete(id);
          send('mp:event', { type: 'guest-disconnect', id });
        };
        socket.on('close', gone);
        socket.on('error', gone);
      });
      srv.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attemptsLeft > 0) tryPort(p + 2, attemptsLeft - 1);
        else resolve({ ok: false, error: err.message });
      });
      srv.listen(p, '0.0.0.0', () => {
        server = srv;
        const wsPort = startWsServer(p + 1);
        resolve({ ok: true, port: p, wsPort, addresses: localAddresses() });
      });
    };
    tryPort(port, 5);
  });
}

// Phone guests: one WebSocket message = one line.
function startWsServer(port) {
  if (!WebSocketServer) return null;
  try {
    wsServer = new WebSocketServer({ port, host: '0.0.0.0', maxPayload: MAX_LINE });
  } catch (e) {
    return null;
  }
  wsServer.on('error', () => {});
  wsServer.on('connection', (ws, req) => {
    const id = nextClientId++;
    const client = {
      write: (line) => {
        if (ws.readyState === 1) ws.send(line.endsWith('\n') ? line.slice(0, -1) : line);
      },
      end: () => ws.close(),
      destroy: () => ws.terminate()
    };
    clients.set(id, client);
    send('mp:event', { type: 'guest-connect', id, address: req.socket.remoteAddress });
    ws.on('message', (data) => send('mp:event', { type: 'message', id, data: data.toString('utf8') }));
    const gone = () => {
      if (!clients.has(id)) return;
      clients.delete(id);
      send('mp:event', { type: 'guest-disconnect', id });
    };
    ws.on('close', gone);
    ws.on('error', gone);
  });
  return port;
}

function stopHost() {
  stopAnnounce();
  for (const socket of clients.values()) socket.destroy();
  clients.clear();
  if (server) server.close();
  server = null;
  if (wsServer) wsServer.close();
  wsServer = null;
}

function hostSend(target, data) {
  const line = data + '\n';
  if (target === '*' || (target && typeof target === 'object')) {
    const except = target && typeof target === 'object' ? target.except : null;
    for (const [id, socket] of clients) if (id !== except) socket.write(line);
  } else {
    clients.get(target)?.write(line);
  }
}

function kick(id) {
  const socket = clients.get(id);
  if (socket) socket.end();
}

// --- Discovery -----------------------------------------------------------------------

function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

// Broadcast addresses of every LAN interface, plus the all-networks one.
function broadcastAddresses() {
  // Loopback too, so a second copy of the game on the same computer sees it.
  const out = new Set(['255.255.255.255', '127.0.0.1']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || !a.netmask) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      out.add(ip.map((b, i) => (b | (~mask[i] & 255)) & 255).join('.'));
    }
  }
  return [...out];
}

function setAnnounce(info) {
  if (!info) return stopAnnounce();
  if (announce) {
    announce.info = info;
    return;
  }
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('error', () => {});
  socket.bind(() => {
    try {
      socket.setBroadcast(true);
    } catch (e) {}
  });
  const tick = () => {
    if (!announce) return;
    const msg = Buffer.from(JSON.stringify({ game: 'underwild', v: 1, ...announce.info }));
    for (const addr of broadcastAddresses()) socket.send(msg, DISCOVERY_PORT, addr, () => {});
  };
  announce = { socket, info, timer: setInterval(tick, ANNOUNCE_MS) };
  setTimeout(tick, 50);
}

function stopAnnounce() {
  if (!announce) return;
  clearInterval(announce.timer);
  try {
    announce.socket.close();
  } catch (e) {}
  announce = null;
}

let browser = null; // { socket, hosts: Map, timer }

function setBrowsing(on) {
  if (!on) {
    if (browser) {
      clearInterval(browser.timer);
      clearInterval(browser.askTimer);
      try {
        browser.socket.close();
      } catch (e) {}
      browser = null;
    }
    return;
  }
  if (browser) return;
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const hosts = new Map();
  socket.on('error', (err) => send('mp:event', { type: 'browse-error', error: err.message }));
  socket.on('message', (buf, rinfo) => {
    try {
      const info = JSON.parse(buf.toString('utf8'));
      if (info.game !== 'underwild' || !info.port) return;
      hosts.set(`${rinfo.address}:${info.port}`, { ...info, address: rinfo.address, seen: Date.now() });
    } catch (e) {}
  });
  socket.bind(DISCOVERY_PORT, () => {
    try {
      socket.setBroadcast(true);
    } catch (e) {}
  });
  const push = () => {
    const now = Date.now();
    for (const [k, h] of hosts) if (now - h.seen > HOST_TIMEOUT_MS) hosts.delete(k);
    send('mp:event', { type: 'hosts', hosts: [...hosts.values()] });
  };
  // Phones announce poorly on some networks, so also ask: hosts that hear this answer us directly.
  const probe = Buffer.from(JSON.stringify({ game: 'underwild', query: 1 }));
  const ask = () => {
    for (const addr of broadcastAddresses()) socket.send(probe, DISCOVERY_PORT, addr, () => {});
  };
  const askTimer = setInterval(ask, ANNOUNCE_MS);
  setTimeout(ask, 300);
  browser = { socket, hosts, timer: setInterval(push, 500), askTimer };
}

// --- Guest ---------------------------------------------------------------------------

let client = null;

function join(address, port = GAME_PORT) {
  leave();
  // Computers host over TCP (plus a WebSocket on the next port); phones host WebSocket only.
  // Try TCP first and fall back to the WebSocket.
  return joinTcp(address, port).then((res) => {
    if (res.ok || !WebSocketClient) return res;
    return joinWs(address, port + 1).then((ws) => (ws.ok ? ws : res));
  });
}

function joinTcp(address, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: address, port });
    socket.setNoDelay(true);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok: false, error: 'Could not reach that game (timed out).' });
    }, 3000);
    socket.once('connect', () => {
      settled = true;
      clearTimeout(timeout);
      client = socket;
      resolve({ ok: true });
    });
    socket.on(
      'data',
      lineReader((line) => send('mp:event', { type: 'message', id: 0, data: line }))
    );
    socket.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ ok: false, error: err.code === 'ECONNREFUSED' ? 'No game is running at that address.' : err.message });
      }
    });
    socket.on('close', () => {
      if (client === socket) {
        client = null;
        send('mp:event', { type: 'host-disconnect' });
      }
    });
  });
}

function joinWs(address, wsPort) {
  return new Promise((resolve) => {
    const ws = new WebSocketClient(`ws://${address}:${wsPort}`, { maxPayload: MAX_LINE });
    let settled = false;
    const wrapper = {
      write: (line) => {
        if (ws.readyState === 1) ws.send(line.endsWith('\n') ? line.slice(0, -1) : line);
      },
      end: () => ws.close(),
      destroy: () => ws.terminate()
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.terminate();
      resolve({ ok: false, error: 'Could not reach that game (timed out).' });
    }, 4000);
    ws.on('open', () => {
      settled = true;
      clearTimeout(timeout);
      client = wrapper;
      resolve({ ok: true });
    });
    ws.on('message', (data) => send('mp:event', { type: 'message', id: 0, data: data.toString('utf8') }));
    ws.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ok: false, error: 'Could not connect to that game.' });
    });
    ws.on('close', () => {
      if (client === wrapper) {
        client = null;
        send('mp:event', { type: 'host-disconnect' });
      }
    });
  });
}

function leave() {
  if (client) {
    const c = client;
    client = null;
    c.end();
    setTimeout(() => c.destroy(), 500);
  }
}

function clientSend(data) {
  client?.write(data + '\n');
}

// --- Wiring --------------------------------------------------------------------------

function setupMultiplayer(ipcMain, getWindow) {
  send = (channel, payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  ipcMain.handle('mp:host', (e, port) => startHost(port));
  ipcMain.on('mp:stopHost', () => stopHost());
  ipcMain.on('mp:announce', (e, info) => setAnnounce(info));
  ipcMain.on('mp:hostSend', (e, target, data) => hostSend(target, data));
  ipcMain.on('mp:kick', (e, id) => kick(id));
  ipcMain.on('mp:browse', (e, on) => setBrowsing(on));
  ipcMain.handle('mp:join', (e, address, port) => join(address, port));
  ipcMain.on('mp:leave', () => leave());
  ipcMain.on('mp:clientSend', (e, data) => clientSend(data));
  ipcMain.handle('mp:addresses', () => localAddresses());
}

function shutdownMultiplayer() {
  stopHost();
  leave();
  setBrowsing(false);
}

module.exports = { setupMultiplayer, shutdownMultiplayer, GAME_PORT };
