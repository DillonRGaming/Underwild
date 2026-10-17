// LAN multiplayer: one player hosts their world, others join it.
//
// The host's game is the real world: it runs the simulation (water, falling sand, furnaces,
// leaves, dropped items, time of day) and saves the world. Guests get a full copy of the
// world when they join and then stay in step:
//   - every block/meta change on the host is sent to the guests;
//   - every block a guest changes (placing, breaking, chests, furnaces...) is sent to the
//     host, which applies it and passes it on to the other guests;
//   - players send their position, pose and held item many times a second;
//   - the host runs the dropped items and tells guests where they are; guests ask the
//     host to spawn items and the host hands them items they walk over;
//   - each guest's inventory and position are kept in the host's world file by name.
//
// The sockets live in the Electron main process (mpMain.js); messages are JSON strings.

import { WorldSerializer } from './core/worldSerializer.js';
import { TILE_SIZE } from './core/utils.js';

export const MP_VERSION = 1;
const STATE_HZ = 20;
const ITEMS_HZ = 15;
const TIME_EVERY_MS = 1000;
const WATER_HZ = 10;               // changes to the water sent to guests
const WATER_FULL_MS = 2000;        // and all of it this often
const SAVE_EVERY_MS = 4000;
const KEEP_CHUNKS_AROUND = 6;      // chunks the host keeps loaded each side of a guest
const PICKUP_RANGE = 12;

const api = () => window.electronAPI?.mp;

// Another player as seen on this screen: eased toward the latest position it sent.
class RemotePlayer {
  constructor(id, info) {
    this.id = id;
    this.name = info.name || 'Player';
    this.setSkin(info.skin, info.skinData);
    this.width = 12;
    this.height = 32;
    this.x = info.state?.x ?? 0;
    this.y = info.state?.y ?? 0;
    this.vx = 0;
    this.vy = 0;
    this.target = info.state || null;
    this.walkAnimation = 0;
    this.walkCycle = 0;
    this.walkingSpeedFactor = 0;
    this.crouching = false;
    this.creativeFlying = false;
    this.swingingArm = 0;
    this.armAction = null;
    this.aimX = this.x + 100;
    this.aimY = this.y;
    this.mining = false;
    this.held = null;
  }

  setSkin(skin, skinData) {
    this.skin = skin || 'steve';
    this.skinImage = null;
    if (skinData) {
      const img = new Image();
      img.onload = () => { this.skinImage = img; };
      img.src = skinData;
    }
  }

  update(dt) {
    const t = this.target;
    if (!t) return;
    const k = Math.min(1, dt * 15);
    // Far off (a teleport or respawn): jump there instead of sliding across the world.
    if (Math.hypot(t.x - this.x, t.y - this.y) > TILE_SIZE * 8) { this.x = t.x; this.y = t.y; }
    this.x += (t.x - this.x) * k;
    this.y += (t.y - this.y) * k;
    this.vx = t.vx || 0;
    this.vy = t.vy || 0;
    this.crouching = !!t.cr;
    this.creativeFlying = !!t.fly;
    this.aimX = t.ax ?? this.x + 100;
    this.aimY = t.ay ?? this.y;
    this.mining = !!t.mine;
    this.held = t.held || null;
    if (t.hu && t.hu !== this.lastHu) {
      if (this.lastHu !== undefined) this.hurtAt = performance.now();
      this.lastHu = t.hu;
    }
    this.swingingArm = t.sw || 0;
    if (t.act && (!this.armAction || this.armAction.type !== t.act || this.armAction.key !== t.actKey)) {
      this.armAction = { type: t.act, key: t.actKey, start: performance.now() };
    }
    // The same walk animation the local player uses.
    const speed = Math.hypot(this.vx, this.vy);
    let factor = Math.min(2, Math.max(0, speed / 120));
    if (!t.ground) factor *= 0.5;
    this.walkingSpeedFactor = factor;
    if (speed > 1) this.walkAnimation += dt * 8 * factor;
    else {
      this.walkAnimation *= 0.9;
      if (Math.abs(this.walkAnimation) < 0.01) this.walkAnimation = 0;
    }
    this.walkCycle = this.walkAnimation % (Math.PI * 2);
  }

  updateMousePosition() {}
}

export class Multiplayer {
  constructor(game) {
    this.game = game;            // hooks into script.js (see createGameAdapter there)
    this.role = null;            // null | 'host' | 'guest'
    this.settings = null;
    this.peers = new Map();      // host: guest id -> { id, name, skin, skinData, ready }
    this.remotePlayers = new Map();
    this.pendingCells = new Map(); // "x,y" -> origin guest id (or null for our own changes)
    this.applyingFrom = undefined; // set while applying cells someone else sent
    this.guestQueue = null;      // guest: messages that arrived before the world was ready
    this.myId = 0;
    this.itemSeq = 1;
    this.guestItems = new Map(); // guest: item id -> entity
    this.lastState = 0;
    this.lastItems = 0;
    this.lastTime = 0;
    this.lastSave = 0;
    this.lanHosts = [];
    this.onHostsChanged = null;
    this.unsubscribe = null;
    this.containerSig = null;
    this.actKey = 0;
  }

  get active() { return !!this.role; }
  get isHost() { return this.role === 'host'; }
  get isGuest() { return this.role === 'guest'; }
  canBuild() { return !this.isGuest || this.settings?.allowBuild !== false; }

  listen() {
    if (this.unsubscribe || !api()) return;
    this.unsubscribe = api().onEvent((ev) => this.onEvent(ev));
  }

  // --- Discovery ---------------------------------------------------------------------

  startBrowsing(onChange) {
    this.listen();
    this.onHostsChanged = onChange;
    this.lanHosts = [];
    api()?.browse(true);
  }

  stopBrowsing() {
    this.onHostsChanged = null;
    api()?.browse(false);
  }

  // --- Hosting -----------------------------------------------------------------------

  // Call once the host's world is loaded and running.
  async host(settings) {
    if (!api()) return { ok: false, error: 'Multiplayer needs the desktop app.' };
    this.listen();
    const res = await api().host(settings.port);
    if (!res.ok) return res;
    this.role = 'host';
    // The game is listed under the world's name.
    this.settings = { ...settings, serverName: this.game.worldName(), port: res.port, wsPort: res.wsPort || null };
    this.peers.clear();
    this.remotePlayers.clear();
    const world = this.game.world;
    world.mpPlayers = world.mpPlayers || {};
    this.updateAnnounce();
    this.game.toast(`Hosting "${this.settings.serverName}"`);
    return res;
  }

  updateAnnounce() {
    if (!this.isHost) return;
    api().announce(this.settings.lan === false ? null : {
      name: this.settings.serverName,
      host: this.game.playerName(),
      world: this.game.worldName(),
      mode: this.game.world?.creativeMode ? 'Creative' : 'Survival',
      players: this.peers.size + 1,
      max: this.settings.maxPlayers,
      port: this.settings.port,
      wsPort: this.settings.wsPort
    });
  }

  // --- Joining -----------------------------------------------------------------------

  async join(address, port) {
    if (!api()) return { ok: false, error: 'Multiplayer needs the desktop app.' };
    this.listen();
    const res = await api().join(address, port);
    if (!res.ok) return res;
    this.role = 'guest';
    this.guestQueue = [];
    this.remotePlayers.clear();
    this.guestItems.clear();
    return new Promise((resolve) => {
      this.joinResolve = resolve;
      const skin = this.game.playerSkin();
      this.send({ t: 'hello', v: MP_VERSION, name: this.game.playerName(), skin: skin.skin, skinData: skin.skinData });
      this.joinTimer = setTimeout(() => this.finishJoin({ ok: false, error: 'The host did not answer.' }), 15000);
    });
  }

  finishJoin(result) {
    clearTimeout(this.joinTimer);
    const resolve = this.joinResolve;
    this.joinResolve = null;
    if (!result.ok) this.stop(false);
    resolve?.(result);
  }

  // --- Leaving -----------------------------------------------------------------------

  // Host: closes the game for everyone. Guest: saves our inventory with the host, then leaves.
  stop(notify = true) {
    if (this.isGuest && notify) this.sendGuestSave();
    if (this.isHost) api()?.stopHost();
    if (this.isGuest) api()?.leave();
    this.role = null;
    this.settings = null;
    this.peers.clear();
    this.remotePlayers.clear();
    this.pendingCells.clear();
    this.guestItems.clear();
    this.guestQueue = null;
    this.containerSig = null;
  }

  // --- Sending -----------------------------------------------------------------------

  send(msg, target = '*') {
    const data = JSON.stringify(msg);
    if (this.isHost) api().hostSend(target, data);
    else if (this.isGuest) api().clientSend(data);
  }

  // --- Events from the main process ----------------------------------------------------

  onEvent(ev) {
    switch (ev.type) {
      case 'hosts':
        this.lanHosts = ev.hosts;
        this.onHostsChanged?.(ev.hosts);
        break;
      case 'guest-connect':
        if (this.isHost) this.peers.set(ev.id, { id: ev.id, name: '?', ready: false, address: ev.address });
        break;
      case 'guest-disconnect':
        if (this.isHost) this.dropGuest(ev.id);
        break;
      case 'host-disconnect':
        if (this.isGuest) {
          if (this.joinResolve) this.finishJoin({ ok: false, error: 'The host closed the connection.' });
          else {
            this.stop(false);
            this.game.leaveToMenu('The host closed the game.');
          }
        }
        break;
      case 'message': {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (this.isHost) this.onGuestMessage(ev.id, msg);
        else if (this.isGuest) {
          if (this.guestQueue && msg.t !== 'welcome' && msg.t !== 'reject') this.guestQueue.push(msg);
          else this.onHostMessage(msg);
        }
        break;
      }
    }
  }

  // --- Host side ---------------------------------------------------------------------

  onGuestMessage(id, msg) {
    const peer = this.peers.get(id);
    if (!peer) return;
    const world = this.game.world;
    switch (msg.t) {
      case 'hello': {
        const name = String(msg.name || 'Player').slice(0, 20);
        const taken = name === this.game.playerName() || [...this.peers.values()].some(p => p.ready && p.name === name);
        if (msg.v !== MP_VERSION) return this.reject(id, 'Your game is a different version from the host\'s.');
        if (this.peers.size + 1 > this.settings.maxPlayers) return this.reject(id, 'The game is full.');
        if (taken) return this.reject(id, `Someone called "${name}" is already playing.`);
        Object.assign(peer, { name, skin: msg.skin, skinData: msg.skinData, ready: true });
        const saved = world.mpPlayers?.[name] || null;
        const others = [{ id: 0, name: this.game.playerName(), ...this.game.playerSkin(), state: this.game.localState() }];
        for (const p of this.peers.values()) {
          if (p.ready && p.id !== id) others.push({ id: p.id, name: p.name, skin: p.skin, skinData: p.skinData, state: this.remotePlayers.get(p.id)?.target });
        }
        this.send({
          t: 'welcome',
          you: id,
          world: WorldSerializer.encode(world, this.game.player, [], null, this.game.sessionMeta()),
          settings: { allowBuild: this.settings.allowBuild, serverName: this.settings.serverName },
          players: others,
          saved,
          spawn: this.game.spawnPoint()
        }, id);
        this.remotePlayers.set(id, new RemotePlayer(id, { name, skin: msg.skin, skinData: msg.skinData, state: saved ? { x: saved.x, y: saved.y } : null }));
        this.send({ t: 'join', id, name, skin: msg.skin, skinData: msg.skinData }, { except: id });
        this.game.toast(`${name} joined the game`);
        this.updateAnnounce();
        break;
      }
      case 'state': {
        const rp = this.remotePlayers.get(id);
        if (!rp) return;
        rp.target = msg.s;
        this.send({ t: 'state', id, s: msg.s }, { except: id });
        break;
      }
      case 'cells':
        if (!peer.ready) return;
        if (!this.settings.allowBuild) {
          // Building is off: put back what's really there.
          this.send({ t: 'cells', c: msg.c.map(([x, y]) => this.cellEntry(x, y)) }, id);
          return;
        }
        this.applyCells(msg.c, id);
        break;
      case 'spawnItem': {
        const e = this.game.spawnItemLocal(msg.id, msg.x, msg.y, msg.count, msg.vx, msg.vy);
        if (e && msg.delay !== undefined) e.pickupDelay = msg.delay;
        break;
      }
      case 'save':
        if (peer.ready && world) world.mpPlayers[peer.name] = msg.s;
        break;
      case 'act':
        // A guest's command aimed at a player: us, or passed on to them.
        if (!peer.ready) return;
        if (msg.to === 0) this.game.applyAction(msg.a);
        else this.send({ t: 'act', a: msg.a }, msg.to);
        break;
      case 'setTime':
        // A guest's /time: the host owns the clock, so set it here and tell everyone.
        if (!peer.ready) return;
        this.game.setTimeFromGuest(msg.time, msg.manual);
        this.lastTime = 0;
        break;
      case 'primed':
        this.game.primed(msg.x, msg.y, msg.fuse, msg.vx, msg.vy, msg.id);
        this.send(msg, { except: id });
        break;
      case 'boom':
        this.game.explosion(msg.x, msg.y);
        this.send(msg, { except: id });
        break;
      case 'bucket':
        // A guest scooped or poured water: the host's water is the real one.
        if (!peer.ready || !this.settings.allowBuild || !world?.water) return;
        if (msg.op === 'pour') world.water.pour(msg.x | 0, msg.y | 0);
        else if (msg.op === 'take') world.water.take(msg.x | 0, msg.y | 0);
        break;
    }
  }

  // A guest used a bucket on (x, y) ('pour' or 'take'): the host does it to its water.
  sendBucket(op, x, y) {
    if (this.isGuest) this.send({ t: 'bucket', op, x, y });
  }

  // Do something to another player (a command's target, or a hit): id 0 is the host.
  sendAction(to, a) {
    if (this.isHost) this.send({ t: 'act', a }, to);
    else if (this.isGuest) this.send({ t: 'act', to, a });
  }

  sendTime(manual) {
    if (this.isGuest) this.send({ t: 'setTime', time: this.game.world.time, manual });
    else if (this.isHost) this.lastTime = 0;
  }

  // An explosive was lit / went off here: show it on everyone else's screen.
  sendPrimed(x, y, fuse, vx = 0, vy = 0, id = 'explosive') {
    if (this.active) this.send({ t: 'primed', x, y, fuse, vx, vy, id });
  }

  sendBoom(x, y) {
    if (this.active) this.send({ t: 'boom', x, y });
  }

  reject(id, reason) {
    this.send({ t: 'reject', reason }, id);
    setTimeout(() => api()?.kick(id), 300);
    this.peers.delete(id);
  }

  dropGuest(id) {
    const peer = this.peers.get(id);
    this.peers.delete(id);
    const rp = this.remotePlayers.get(id);
    if (rp && peer?.ready && this.game.world?.mpPlayers?.[peer.name]) {
      Object.assign(this.game.world.mpPlayers[peer.name], { x: rp.x, y: rp.y });
    }
    this.remotePlayers.delete(id);
    if (peer?.ready) {
      this.send({ t: 'leave', id });
      this.game.toast(`${peer.name} left the game`);
    }
    this.updateAnnounce();
  }

  // Chunks the host must keep loaded (and simulating) because guests are in them.
  keepChunkCenters() {
    if (!this.isHost) return [];
    const world = this.game.world;
    return [...this.remotePlayers.values()].map(rp => world.chunkXFor(Math.floor((rp.x + rp.width / 2) / TILE_SIZE)));
  }

  keepRadius() { return KEEP_CHUNKS_AROUND; }

  // The player an item should drift toward and be picked up by: us or a guest.
  nearestPlayer(item, local) {
    if (!this.isHost || this.remotePlayers.size === 0) return local;
    let best = local;
    let bestD = Math.hypot(local.x + local.width / 2 - item.x, local.y + local.height / 2 - item.y);
    for (const rp of this.remotePlayers.values()) {
      const d = Math.hypot(rp.x + rp.width / 2 - item.x, rp.y + rp.height / 2 - item.y);
      if (d < bestD) { best = rp; bestD = d; }
    }
    return best;
  }

  // Host: a guest is close enough to an item to take it. Returns true if it was handed over.
  givePickup(item, rp) {
    const cx = rp.x + rp.width / 2;
    const ix = item.x + item.width / 2;
    const iy = item.y + item.height / 2;
    const d = Math.min(
      Math.hypot(cx - ix, rp.y + rp.height / 2 - iy),
      Math.hypot(cx - ix, rp.y + rp.height * 0.3 - iy),
      Math.hypot(cx - ix, rp.y + rp.height - iy)
    );
    if (d >= PICKUP_RANGE) return false;
    this.send({ t: 'give', id: item.blockId || item.itemId, count: item.count || 1 }, rp.id);
    return true;
  }

  // --- Guest side --------------------------------------------------------------------

  async onHostMessage(msg) {
    switch (msg.t) {
      case 'reject':
        this.finishJoin({ ok: false, error: msg.reason });
        break;
      case 'welcome': {
        this.myId = msg.you;
        this.settings = msg.settings;
        try {
          const decoded = WorldSerializer.decode(msg.world);
          await this.game.startGuestWorld(decoded, msg.saved, msg.spawn, msg.settings.serverName);
        } catch (e) {
          console.error('Joining failed:', e);
          this.finishJoin({ ok: false, error: 'Could not load the host\'s world: ' + e.message });
          return;
        }
        for (const p of msg.players) this.remotePlayers.set(p.id, new RemotePlayer(p.id, p));
        const queued = this.guestQueue || [];
        this.guestQueue = null;
        for (const m of queued) this.onHostMessage(m);
        this.finishJoin({ ok: true });
        this.game.toast(`Joined "${msg.settings.serverName}"`);
        break;
      }
      case 'join':
        this.remotePlayers.set(msg.id, new RemotePlayer(msg.id, msg));
        this.game.toast(`${msg.name} joined the game`);
        break;
      case 'leave': {
        const rp = this.remotePlayers.get(msg.id);
        this.remotePlayers.delete(msg.id);
        if (rp) this.game.toast(`${rp.name} left the game`);
        break;
      }
      case 'state': {
        const rp = this.remotePlayers.get(msg.id);
        if (rp) rp.target = msg.s;
        break;
      }
      case 'cells':
        this.applyCells(msg.c, 0);
        break;
      case 'time':
        this.game.setTime(msg.time, msg.clock);
        break;
      case 'items':
        this.syncGuestItems(msg.list);
        break;
      case 'wg':
        this.game.world?.water?.netApply(msg.r || []);
        break;
      case 'give':
        this.game.receiveItem(msg.id, msg.count);
        break;
      case 'act':
        this.game.applyAction(msg.a);
        break;
      case 'primed':
        this.game.primed(msg.x, msg.y, msg.fuse, msg.vx, msg.vy, msg.id);
        break;
      case 'boom':
        this.game.explosion(msg.x, msg.y);
        break;
    }
  }

  sendGuestSave() {
    const s = this.game.guestSaveData();
    if (s) this.send({ t: 'save', s });
  }

  // Guest: make the dropped items match the host's list, easing each toward where it is.
  syncGuestItems(list) {
    const seen = new Set();
    for (const [id, blockId, x, y, count] of list) {
      seen.add(id);
      let e = this.guestItems.get(id);
      if (!e) {
        e = this.game.makeItemEntity(blockId, x, y);
        if (!e) continue;
        this.guestItems.set(id, e);
      }
      e.mpTarget = { x, y };
      e.count = count;
    }
    for (const id of [...this.guestItems.keys()]) if (!seen.has(id)) this.guestItems.delete(id);
    const items = this.game.items;
    items.length = 0;
    for (const e of this.guestItems.values()) items.push(e);
  }

  // --- Blocks ------------------------------------------------------------------------

  // world.onBlockChanged: a cell changed here. Note it to send (unless we're applying
  // someone else's change, and as a guest only our own edits go back to the host).
  onCellChanged(x, y) {
    if (!this.active) return;
    if (this.isGuest && this.applyingFrom !== undefined) return;
    const key = x + ',' + y;
    const origin = this.applyingFrom === undefined ? null : this.applyingFrom;
    this.pendingCells.set(key, this.pendingCells.has(key) && this.pendingCells.get(key) !== origin ? null : origin);
  }

  cellEntry(x, y) {
    const cell = this.game.world.getCell(x, y);
    return [x, y, cell.id, cell.meta ?? null];
  }

  applyCells(list, origin) {
    const world = this.game.world;
    if (!world) return;
    this.applyingFrom = origin;
    try {
      for (const [x, y, id, meta] of list) {
        if (!this.game.registry.get(id)) continue;
        world.applyRemoteCell(x, y, id, meta ? JSON.parse(JSON.stringify(meta)) : null);
        // The host passes guests' edits on to everyone else.
        if (this.isHost) this.onCellChanged(x, y);
        this.game.onRemoteCell(x, y, id);
      }
    } finally {
      this.applyingFrom = undefined;
    }
    this.containerSig = this.game.containerSignature();
  }

  flushCells() {
    if (this.pendingCells.size === 0) return;
    const entries = [];
    for (const [key, origin] of this.pendingCells) {
      const i = key.indexOf(',');
      entries.push([this.cellEntry(+key.slice(0, i), +key.slice(i + 1)), origin]);
    }
    this.pendingCells.clear();
    if (this.isGuest) {
      this.send({ t: 'cells', c: entries.map(e => e[0]) });
      return;
    }
    for (const peer of this.peers.values()) {
      if (!peer.ready) continue;
      const c = entries.filter(([, origin]) => origin !== peer.id).map(e => e[0]);
      if (c.length) this.send({ t: 'cells', c }, peer.id);
    }
  }

  // --- Every frame -------------------------------------------------------------------

  update(dt) {
    if (!this.active || !this.game.world || !this.game.player) return;
    if (this.isGuest && this.guestQueue) return;
    const now = performance.now();

    // Chest/furnace contents edited in place by the open container's UI.
    const sig = this.game.containerSignature();
    if (sig && sig !== this.containerSig) this.game.touchOpenContainer();
    this.containerSig = sig;

    this.flushCells();

    if (now - this.lastState >= 1000 / STATE_HZ) {
      this.lastState = now;
      const s = this.game.localState();
      if (this.isHost) this.send({ t: 'state', id: 0, s });
      else this.send({ t: 'state', s });
    }

    if (this.isHost) {
      if (now - this.lastItems >= 1000 / ITEMS_HZ) {
        this.lastItems = now;
        const list = this.game.items.map(it => {
          if (!it.mpId) it.mpId = this.itemSeq++;
          return [it.mpId, it.blockId || it.itemId, Math.round(it.x * 10) / 10, Math.round(it.y * 10) / 10, it.count || 1];
        });
        this.send({ t: 'items', list });
      }
      // Water: the parts that changed (guests don't simulate it, they draw what we send),
      // and every couple of seconds all of it, for chunks a guest has only just loaded.
      const water = this.game.world.water;
      if (water && now - (this.lastWater || 0) >= 1000 / WATER_HZ) {
        this.lastWater = now;
        const full = now - (this.lastWaterFull || 0) >= WATER_FULL_MS;
        if (full) this.lastWaterFull = now;
        const r = water.netRegions(full);
        if (r.length) this.send({ t: 'wg', r });
      }
      if (now - this.lastTime >= TIME_EVERY_MS) {
        this.lastTime = now;
        this.send({ t: 'time', time: this.game.world.time, clock: this.game.clock() });
      }
    } else {
      for (const e of this.guestItems.values()) {
        if (!e.mpTarget) continue;
        const k = Math.min(1, dt * 15);
        e.x += (e.mpTarget.x - e.x) * k;
        e.y += (e.mpTarget.y - e.y) * k;
      }
      if (now - this.lastSave >= SAVE_EVERY_MS) {
        this.lastSave = now;
        this.sendGuestSave();
      }
    }

    for (const rp of this.remotePlayers.values()) rp.update(dt);
  }

  playerCount() {
    return this.remotePlayers.size + 1;
  }
}
