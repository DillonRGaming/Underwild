// Outside the desktop app (the Android app, or the game in a web browser) there is no
// Electron to save files or open sockets. This fills in the same `window.electronAPI`
// pieces the game uses, the browser way:
//   - worlds: saved in the browser's IndexedDB
//   - prefs: saved in localStorage
//   - mp (Android app only): finds games on the Wi-Fi with the app's LanDiscovery plugin
//     and joins them over WebSocket. It can also host, with the LanHost plugin.
// The desktop-only parts (window buttons, app icon, fullscreen...) stay missing, so the
// game hides them as it already does in a browser.

if (typeof window !== 'undefined' && !window.electronAPI) {
  const api = {};

  // --- Worlds ---------------------------------------------------------------------------
  const DB_NAME = 'underwild';
  const STORE = 'worlds';
  let dbPromise = null;
  const db = () => dbPromise || (dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
    });
  };
  const fileName = (name) => String(name || '').replace(/[^a-zA-Z0-9_\- ]/g, '_').trim() || 'World';

  api.worlds = {
    async list() {
      const d = await db();
      return new Promise((resolve) => {
        const out = [];
        const req = d.transaction(STORE).objectStore(STORE).openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) {
            out.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
            resolve(out);
            return;
          }
          const rec = c.value;
          let meta = {};
          try { meta = JSON.parse(rec.json).meta || {}; } catch (e) {}
          // The same fields the desktop app lists (see main.js worlds:list).
          out.push({
            name: meta.displayName || rec.name,
            fileName: c.key + '.json',
            seed: meta.seed || 0,
            gameMode: meta.gameMode || 'survival',
            createdAt: rec.createdAt || rec.modifiedAt,
            modifiedAt: rec.modifiedAt,
            sizeBytes: rec.json.length
          });
          c.continue();
        };
        req.onerror = () => resolve(out);
      });
    },
    async exists(name) { return !!(await tx('readonly', s => s.get(fileName(name)))); },
    async save(name, json) {
      const old = await tx('readonly', s => s.get(fileName(name)));
      const now = Date.now();
      await tx('readwrite', s => s.put({ name, json, createdAt: old?.createdAt || now, modifiedAt: now }, fileName(name)));
      return true;
    },
    // Browsers can't write synchronously; start the write and let it finish in the background.
    saveSync(name, json) { api.worlds.save(name, json).catch(() => {}); return true; },
    async load(name) { return (await tx('readonly', s => s.get(fileName(name))))?.json ?? null; },
    async delete(name) { await tx('readwrite', s => s.delete(fileName(name))); return true; }
  };

  // --- Preferences ------------------------------------------------------------------------
  const PREFS_KEY = 'underwild-prefs';
  const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; } };
  const writePrefs = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} };
  api.prefs = {
    async getAll() { return readPrefs(); },
    async get(key) { return readPrefs()[key] ?? null; },
    async set(key, value) { const p = readPrefs(); p[key] = value; writePrefs(p); return true; },
    async setMany(entries) { const p = readPrefs(); Object.assign(p, entries); writePrefs(p); return true; },
    async delete(key) { const p = readPrefs(); delete p[key]; writePrefs(p); return true; },
    async clear() { writePrefs({}); return true; }
  };

  // --- Multiplayer (Android app) ------------------------------------------------------------
  const cap = window.Capacitor;
  const discovery = cap?.isNativePlatform?.() ? (cap.Plugins?.LanDiscovery || cap.registerPlugin?.('LanDiscovery')) : null;
  if (discovery) {
    const listeners = new Set();
    const emit = (ev) => { for (const cb of listeners) cb(ev); };
    const hosts = new Map();      // "address:port" -> info
    let browseTimer = null;
    let browseHandle = null;
    let socket = null;
    const lanHost = cap.Plugins?.LanHost || cap.registerPlugin?.('LanHost');
    let hostHandles = [];
    const HOST_TIMEOUT_MS = 4000;

    api.mp = {
      onEvent(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      async host(port) {
        if (!lanHost) return { ok: false, error: 'Hosting is not available in this app.' };
        try {
          if (!hostHandles.length) {
            hostHandles = await Promise.all([
              lanHost.addListener('guestConnect', ({ id, address }) => emit({ type: 'guest-connect', id, address })),
              lanHost.addListener('guestMessage', ({ id, data }) => emit({ type: 'message', id, data })),
              lanHost.addListener('guestDisconnect', ({ id }) => emit({ type: 'guest-disconnect', id }))
            ]);
          }
          return await lanHost.startHost({ port: port || 47777 });
        } catch (e) {
          return { ok: false, error: e.message || 'Could not start the game.' };
        }
      },
      stopHost() {
        lanHost?.announce({ info: null }).catch(() => {});
        lanHost?.stopHost().catch(() => {});
        for (const h of hostHandles) h.remove?.();
        hostHandles = [];
      },
      announce(info) {
        lanHost?.announce({ info: info ? JSON.stringify({ game: 'underwild', v: 1, ...info }) : null }).catch(() => {});
      },
      hostSend(target, data) {
        if (!lanHost) return;
        const line = typeof data === 'string' && data.endsWith('\n') ? data.slice(0, -1) : data;
        if (target === '*' || (target && typeof target === 'object')) {
          lanHost.send({ all: true, except: target && typeof target === 'object' ? target.except : -1, data: line }).catch(() => {});
        } else {
          lanHost.send({ id: target, data: line }).catch(() => {});
        }
      },
      kick(id) { lanHost?.kick({ id }).catch(() => {}); },
      async addresses() {
        try { return (await lanHost.addresses()).addresses || []; } catch (e) { return []; }
      },
      async browse(on) {
        if (!on) {
          clearInterval(browseTimer);
          browseTimer = null;
          browseHandle?.remove?.();
          browseHandle = null;
          discovery.stop().catch(() => {});
          return;
        }
        if (browseTimer) return;
        hosts.clear();
        browseHandle = await discovery.addListener('host', ({ data, address }) => {
          try {
            const info = JSON.parse(data);
            if (info.game !== 'underwild' || !info.port || !info.wsPort) return;
            hosts.set(`${address}:${info.port}`, { ...info, address, seen: Date.now() });
          } catch (e) {}
        });
        discovery.start().catch((e) => emit({ type: 'browse-error', error: e.message }));
        browseTimer = setInterval(() => {
          const now = Date.now();
          for (const [k, h] of hosts) if (now - h.seen > HOST_TIMEOUT_MS) hosts.delete(k);
          emit({ type: 'hosts', hosts: [...hosts.values()] });
        }, 500);
      },
      join(address, port) {
        api.mp.leave();
        const known = [...hosts.values()].find(h => h.address === address && (!port || h.port === port));
        const wsPort = known?.wsPort || (port ? port + 1 : 47778);
        return new Promise((resolve) => {
          let settled = false;
          const ws = new WebSocket(`ws://${address}:${wsPort}`);
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            ws.close();
            resolve({ ok: false, error: 'Could not reach that game (timed out).' });
          }, 6000);
          ws.onopen = () => {
            settled = true;
            clearTimeout(timer);
            socket = ws;
            resolve({ ok: true });
          };
          ws.onmessage = (e) => emit({ type: 'message', id: 0, data: typeof e.data === 'string' ? e.data : '' });
          ws.onerror = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ ok: false, error: 'Could not connect to that game.' });
          };
          ws.onclose = () => {
            if (socket !== ws) return;
            socket = null;
            emit({ type: 'host-disconnect' });
          };
        });
      },
      leave() {
        const ws = socket;
        socket = null;
        ws?.close();
      },
      clientSend(data) {
        if (socket?.readyState === 1) socket.send(data);
      }
    };
  }

  window.electronAPI = api;
  window.isWebPlatform = true;
}
