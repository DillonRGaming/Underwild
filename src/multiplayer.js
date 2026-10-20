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
import { wind } from './core/wind.js';
import { weather } from './core/weather.js';

export const MP_VERSION = 1;
const STATE_HZ = 20;
const ITEMS_HZ = 15;
const TIME_EVERY_MS = 1000;
const WATER_HZ = 10; // changes to the water sent to guests
const WATER_FULL_MS = 2000; // and all of it this often
const SAVE_EVERY_MS = 4000;
const KEEP_CHUNKS_AROUND = 6; // chunks the host keeps loaded each side of a guest
const PICKUP_RANGE = 12;
const MAX_CELLS_PER_MESSAGE = 4096; // more than any one edit (an explosion, a /fill) sends
const GUEST_ITEM_REACH = 24 * TILE_SIZE; // how far from a guest the host spawns its dropped items
const MAX_HIT_DAMAGE = 10;

const api = () => window.electronAPI?.mp;

// Another player as seen on this screen: eased toward the latest position it sent.
// A player's chosen colour: #rrggbb, or null for the default.
const validColor = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);
// Guests' messages are checked before the host acts on them: numbers must be real numbers.
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A guest's position and pose, keeping only the fields players send (see localPlayerState in
// script.js), so nothing else is passed on to the other guests.
function cleanState(s) {
  if (!s || typeof s !== 'object' || num(s.x) === null || num(s.y) === null) return null;
  const held =
    s.held && typeof s.held === 'object'
      ? {
          type: s.held.type === 'item' ? 'item' : 'block',
          blockId: typeof s.held.blockId === 'string' ? s.held.blockId : undefined,
          itemId: typeof s.held.itemId === 'string' ? s.held.itemId : undefined,
          count: 1
        }
      : null;
  return {
    x: s.x,
    y: s.y,
    vx: num(s.vx) ?? 0,
    vy: num(s.vy) ?? 0,
    ground: !!s.ground,
    cr: !!s.cr,
    fly: !!s.fly,
    ax: num(s.ax) ?? s.x,
    ay: num(s.ay) ?? s.y,
    mine: !!s.mine,
    sw: num(s.sw) ?? 0,
    act: typeof s.act === 'string' ? s.act.slice(0, 16) : null,
    actKey: num(s.actKey) ?? 0,
    held,
    hu: num(s.hu) ?? 0
  };
}

class RemotePlayer {
  constructor(id, info) {
    this.id = id;
    this.name = info.name || 'Player';
    this.dummy = !!info.dummy;
    this.color = validColor(info.color);
    this.setSkin(this.dummy ? 'dummy' : info.skin, this.dummy ? null : info.skinData);
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
    if (this.dummy) {
      this.skin = 'dummy';
      this.skinImage = null;
      return;
    }
    this.skin = skin || 'steve';
    this.skinImage = null;
    if (skinData) {
      const img = new Image();
      img.onload = () => {
        this.skinImage = img;
      };
      img.src = skinData;
    }
  }

  // A dummy has no one steering it: it is knocked about, falls and lands.
  dummyPhysics(dt, world) {
    // Sideways: slide with the knockback, stopped by blocks, slowing down on the ground.
    if (this.vx) {
      const nx = this.x + this.vx * dt;
      const edge = Math.floor((this.vx > 0 ? nx + this.width : nx) / TILE_SIZE);
      let blocked = false;
      for (let ty = Math.floor(this.y / TILE_SIZE); ty <= Math.floor((this.y + this.height - 1) / TILE_SIZE); ty++) {
        if (world.isSolidAt(edge, ty)) blocked = true;
      }
      if (blocked) this.vx = 0;
      else this.x = nx;
      this.vx *= Math.exp(-(this.onGround ? 8 : 1) * dt);
      if (Math.abs(this.vx) < 4) this.vx = 0;
    }
    this.onGround = false;
    this.vy = Math.min(500, this.vy + 800 * dt);
    this.y += this.vy * dt;
    const bottomRow = Math.floor((this.y + this.height) / TILE_SIZE);
    const left = Math.floor(this.x / TILE_SIZE);
    const right = Math.floor((this.x + this.width) / TILE_SIZE);
    if (this.vy >= 0 && (world.isSolidAt(left, bottomRow) || world.isSolidAt(right, bottomRow))) {
      this.y = bottomRow * TILE_SIZE - this.height;
      this.vy = 0;
      this.onGround = true;
    }
  }

  // Hit by the player: knocked back and hurt; at zero health it is put back where it was spawned.
  dummyHit(dmg, vx, vy, game) {
    this.health -= dmg;
    this.hurtAt = performance.now();
    this.vx = vx || 0;
    this.vy = vy || 0;
    if (this.health <= 0) {
      game.toast(`${this.name} was knocked out`);
      this.health = 20;
      this.x = this.home.x;
      this.y = this.home.y;
      this.vx = 0;
      this.vy = 0;
    }
  }

  update(dt) {
    if (this.dummy) return;
    const t = this.target;
    if (!t) return;
    const k = Math.min(1, dt * 15);
    // Far off (a teleport or respawn): jump there instead of sliding across the world.
    if (Math.hypot(t.x - this.x, t.y - this.y) > TILE_SIZE * 8) {
      this.x = t.x;
      this.y = t.y;
    }
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
    this.game = game; // hooks into script.js (see createGameAdapter there)
    this.role = null; // null | 'host' | 'guest'
    this.settings = null;
    this.peers = new Map(); // host: guest id -> { id, name, skin, skinData, ready }
    this.remotePlayers = new Map();
    this.pendingCells = new Map(); // "x,y" -> origin guest id (or null for our own changes)
    this.applyingFrom = undefined; // set while applying cells someone else sent
    this.guestQueue = null; // guest: messages that arrived before the world was ready
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

  // What a guest may do. The host decides per guest (see setPermission); a guest is told its own.
  canUseCommands() {
    return !this.isGuest || this.settings?.commands !== false;
  }

  get active() {
    return !!this.role;
  }
  get isHost() {
    return this.role === 'host';
  }
  get isGuest() {
    return this.role === 'guest';
  }
  canBuild() {
    return !this.isGuest || this.settings?.allowBuild !== false;
  }

  listen() {
    if (this.unsubscribe || !api()) return;
    this.unsubscribe = api().onEvent((ev) => this.onEvent(ev));
  }

  // A chat message from this player: shown here, and passed around when in a game with others.
  sendChat(text, me = false) {
    const name = this.game.playerName();
    if (this.isHost) {
      const col = this.game.playerColor();
      this.send({ t: 'chat', name, text, me: me ? 1 : 0, col });
      this.game.chat(name, text, me, col);
    } else if (this.isGuest) {
      this.send({ t: 'chat', text, me: me ? 1 : 0 }); // the host sends it back to everyone, us included
    } else {
      this.game.chat(name, text, me, this.game.playerColor());
    }
  }

  // Our own colour changed: tell the others.
  sendColor(c) {
    if (this.isHost) this.send({ t: 'color', id: 0, c });
    else if (this.isGuest) this.send({ t: 'color', c });
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
    api().announce(
      this.settings.lan === false
        ? null
        : {
            name: this.settings.serverName,
            host: this.game.playerName(),
            world: this.game.worldName(),
            mode: this.game.world?.creativeMode ? 'Creative' : 'Survival',
            players: this.peers.size + 1,
            max: this.settings.maxPlayers,
            port: this.settings.port,
            wsPort: this.settings.wsPort
          }
    );
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
      this.send({ t: 'hello', v: MP_VERSION, name: this.game.playerName(), skin: skin.skin, skinData: skin.skinData, color: this.game.playerColor() });
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
        try {
          msg = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
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
    if (!peer || !msg || typeof msg !== 'object') return;
    // Until a guest has said hello and been let in, that's all it may send.
    if (msg.t !== 'hello' && !peer.ready) return;
    const world = this.game.world;
    switch (msg.t) {
      case 'hello': {
        if (peer.ready) return;
        const name = String(msg.name || 'Player').slice(0, 20);
        const taken = name === this.game.playerName() || [...this.peers.values()].some((p) => p.ready && p.name === name);
        if (msg.v !== MP_VERSION) return this.reject(id, "Your game is a different version from the host's.");
        if (this.isBanned(name, peer.address)) return this.reject(id, 'You are banned from this game.');
        if (this.peers.size + 1 > this.settings.maxPlayers) return this.reject(id, 'The game is full.');
        if (taken) return this.reject(id, `Someone called "${name}" is already playing.`);
        const skinData = typeof msg.skinData === 'string' && msg.skinData.startsWith('data:image/') ? msg.skinData : null;
        const perms = { build: this.settings.allowBuild !== false, commands: !!this.game.commandsAllowed() };
        Object.assign(peer, { name, skin: typeof msg.skin === 'string' ? msg.skin : 'steve', skinData, color: validColor(msg.color), perms, ready: true });
        const saved = world.mpPlayers?.[name] || null;
        const others = [{ id: 0, name: this.game.playerName(), ...this.game.playerSkin(), color: this.game.playerColor(), state: this.game.localState() }];
        for (const p of this.peers.values()) {
          if (p.ready && p.id !== id)
            others.push({ id: p.id, name: p.name, skin: p.skin, skinData: p.skinData, color: p.color, state: this.remotePlayers.get(p.id)?.target });
        }
        this.send(
          {
            t: 'welcome',
            you: id,
            world: WorldSerializer.encode(world, this.game.player, [], null, this.game.sessionMeta()),
            settings: { allowBuild: perms.build, commands: perms.commands, serverName: this.settings.serverName },
            players: others,
            saved,
            spawn: this.game.spawnPoint()
          },
          id
        );
        this.remotePlayers.set(
          id,
          new RemotePlayer(id, { name, skin: peer.skin, skinData, color: peer.color, state: saved ? { x: saved.x, y: saved.y } : null })
        );
        this.send({ t: 'join', id, name, skin: peer.skin, skinData, color: peer.color }, { except: id });
        this.game.toast(`${name} joined the game`);
        this.updateAnnounce();
        break;
      }
      case 'chat': {
        const text = String(msg.text || '').slice(0, 128);
        if (!text) break;
        this.send({ t: 'chat', name: peer.name, text, me: msg.me ? 1 : 0, col: peer.color });
        this.game.chat(peer.name, text, !!msg.me, peer.color);
        break;
      }
      case 'color': {
        // A guest changed their colour: remember it and tell everyone else.
        peer.color = validColor(msg.c);
        const rp = this.remotePlayers.get(id);
        if (rp) rp.color = peer.color;
        this.send({ t: 'color', id, c: peer.color }, { except: id });
        break;
      }
      case 'state': {
        const rp = this.remotePlayers.get(id);
        const s = cleanState(msg.s);
        if (!rp || !s) return;
        rp.target = s;
        this.send({ t: 'state', id, s }, { except: id });
        break;
      }
      case 'cells': {
        if (!Array.isArray(msg.c)) return;
        const list = msg.c
          .slice(0, MAX_CELLS_PER_MESSAGE)
          .filter((e) => Array.isArray(e) && Number.isInteger(e[0]) && Number.isInteger(e[1]) && typeof e[2] === 'string');
        if (!peer.perms.build) {
          // Not allowed to build: put back what's really there.
          if (list.length) this.send({ t: 'cells', c: list.map(([x, y]) => this.cellEntry(x, y)) }, id);
          return;
        }
        this.applyCells(list, id);
        break;
      }
      case 'spawnItem': {
        // Items a guest drops (thrown, mined, spilled from a chest). Only real items, a stack
        // at most, and near where that guest is.
        const def = this.game.registry.get(msg.id);
        const rp = this.remotePlayers.get(id);
        const x = num(msg.x),
          y = num(msg.y);
        const count = Number.isInteger(msg.count) ? msg.count : 1;
        if (!def || def.hidden || !rp || x === null || y === null) return;
        if (count < 1 || count > (def.maxStack ?? 24)) return;
        if (Math.hypot(x - rp.x, y - rp.y) > GUEST_ITEM_REACH) return;
        const e = this.game.spawnItemLocal(msg.id, x, y, count, clamp(num(msg.vx) ?? 0, -10, 10), clamp(num(msg.vy) ?? 0, -10, 10));
        if (e && num(msg.delay) !== null) e.pickupDelay = clamp(msg.delay, 0, 600);
        break;
      }
      case 'save':
        if (world && msg.s && typeof msg.s === 'object' && !Array.isArray(msg.s)) world.mpPlayers[peer.name] = msg.s;
        break;
      case 'act': {
        // A guest's command aimed at a player (us, or passed on to them), or a hit.
        const a = msg.a;
        if (!a || typeof a !== 'object') return;
        if (a.k === 'hit') {
          a.dmg = clamp(num(a.dmg) ?? 1, 0, MAX_HIT_DAMAGE);
          a.vx = clamp(num(a.vx) ?? 0, -400, 400);
          a.vy = clamp(num(a.vy) ?? 0, -400, 400);
        } else if (!peer.perms.commands) {
          return;
        }
        if (msg.to === 0) this.game.applyAction(a);
        else if (this.peers.get(msg.to)?.ready) this.send({ t: 'act', a }, msg.to);
        break;
      }
      case 'setTime': {
        // A guest's /time: the host owns the clock, so set it here and tell everyone.
        const time = num(msg.time);
        const day = world?.dayLength || 1440;
        if (!peer.perms.commands || time === null) return;
        this.game.setTimeFromGuest(((time % day) + day) % day, !!msg.manual);
        this.lastTime = 0;
        break;
      }
      case 'setWeather': {
        // A guest's /weather: the host's is the real one.
        if (!peer.perms.commands) return;
        if (msg.type === 'auto') {
          weather.auto = true;
          weather.untilChange = 60;
        } else if (weather.set(msg.type)) weather.auto = false;
        this.lastTime = 0;
        break;
      }
      case 'setWind': {
        // A guest's /wind: like /time, the host's is the real one.
        const speed = num(msg.speed);
        if (!peer.perms.commands || speed === null) return;
        wind.set(speed);
        this.lastTime = 0;
        break;
      }
      case 'primed': {
        const x = num(msg.x),
          y = num(msg.y);
        if (!peer.perms.build || x === null || y === null || !this.game.registry.get(msg.id)?.explosive) return;
        const clean = {
          t: 'primed',
          x,
          y,
          fuse: clamp(num(msg.fuse) ?? 0, 0, 30000),
          vx: clamp(num(msg.vx) ?? 0, -20, 20),
          vy: clamp(num(msg.vy) ?? 0, -20, 20),
          id: msg.id
        };
        this.game.primed(clean.x, clean.y, clean.fuse, clean.vx, clean.vy, clean.id);
        this.send(clean, { except: id });
        break;
      }
      case 'boom': {
        const x = num(msg.x),
          y = num(msg.y);
        if (!peer.perms.build || !Number.isInteger(x) || !Number.isInteger(y)) return;
        this.game.explosion(x, y);
        this.send({ t: 'boom', x, y }, { except: id });
        break;
      }
      case 'bucket':
        // A guest scooped or poured water: the host's water is the real one.
        if (!peer.perms.build || !world?.water || num(msg.x) === null || num(msg.y) === null) return;
        if (msg.op === 'pour') world.water.pour(msg.x | 0, msg.y | 0);
        else if (msg.op === 'take') world.water.take(msg.x | 0, msg.y | 0);
        break;
    }
  }

  // --- Moderation (host) -------------------------------------------------------------

  // A connected guest by name (case doesn't matter), or null.
  findGuest(name) {
    const n = String(name || '').toLowerCase();
    return [...this.peers.values()].find((p) => p.ready && p.name.toLowerCase() === n) || null;
  }

  guests() {
    return [...this.peers.values()].filter((p) => p.ready);
  }

  isBanned(name, address) {
    const n = String(name || '').toLowerCase();
    return this.game.bans().some((b) => b.name.toLowerCase() === n || (address && b.address === address));
  }

  // Sends a guest out of the game with a reason they're shown.
  kick(id, reason = 'You were kicked from the game.') {
    const peer = this.peers.get(id);
    if (!this.isHost || !peer) return false;
    this.send({ t: 'kicked', reason }, id);
    setTimeout(() => api()?.kick(id), 300);
    this.dropGuest(id);
    return true;
  }

  // Bans a name (and the address it's playing from, if it's here) and kicks it if it's playing.
  ban(name, reason = 'You were banned from this game.') {
    const peer = this.findGuest(name);
    const entry = { name: peer?.name || String(name).slice(0, 20), address: peer?.address || null };
    const bans = this.game.bans().filter((b) => b.name.toLowerCase() !== entry.name.toLowerCase());
    this.game.setBans([...bans, entry]);
    if (peer) this.kick(peer.id, reason);
    return entry;
  }

  unban(name) {
    const n = String(name || '').toLowerCase();
    const bans = this.game.bans();
    const left = bans.filter((b) => b.name.toLowerCase() !== n);
    this.game.setBans(left);
    return left.length !== bans.length;
  }

  // Lets a guest build ('build') or use commands ('commands'), or stops them. They're told.
  setPermission(id, key, on) {
    const peer = this.peers.get(id);
    if (!this.isHost || !peer?.ready || !(key in peer.perms)) return false;
    peer.perms[key] = !!on;
    this.send({ t: 'perms', build: peer.perms.build, commands: peer.perms.commands }, id);
    return true;
  }

  // A guest used a bucket on (x, y) ('pour' or 'take'): the host does it to its water.
  sendBucket(op, x, y) {
    if (this.isGuest) this.send({ t: 'bucket', op, x, y });
  }

  // Do something to another player (a command's target, or a hit): id 0 is the host.
  // A fake player for testing: it only exists on this screen and stands where it was put.
  spawnDummy(name, x, y) {
    let rp = [...this.remotePlayers.values()].find((r) => r.dummy && r.name === name);
    if (!rp) {
      this.dummies = (this.dummies || 0) + 1;
      rp = new RemotePlayer(-this.dummies, { name, dummy: true, skin: 'dummy' });
      rp.dummy = true;
      rp.skin = 'dummy';
      this.remotePlayers.set(rp.id, rp);
    }
    rp.dummy = true;
    rp.skin = 'dummy';
    rp.x = x;
    rp.y = y;
    rp.vy = 0;
    rp.home = { x, y };
    rp.health = 20;
    return rp;
  }

  findDummy(name) {
    return [...this.remotePlayers.values()].find((r) => r.dummy && r.name === name) || null;
  }

  removeDummy(name) {
    const rp = [...this.remotePlayers.values()].find((r) => r.dummy && r.name === name);
    if (rp) this.remotePlayers.delete(rp.id);
    return !!rp;
  }

  sendAction(to, a) {
    const dummy = this.remotePlayers.get(to);
    if (dummy?.dummy) {
      if (a.k === 'tp') {
        dummy.x = a.x;
        dummy.y = a.y;
        dummy.vy = 0;
        dummy.home = { x: a.x, y: a.y };
      } else if (a.k === 'hit') dummy.dummyHit(a.dmg, a.vx, a.vy, this.game);
      else if (a.k === 'color') dummy.color = validColor(a.c);
      return;
    }
    if (this.isHost) this.send({ t: 'act', a }, to);
    else if (this.isGuest) this.send({ t: 'act', to, a });
  }

  // /wind here: a guest asks the host; the host's goes out with the next time update.
  sendWeather(type) {
    if (this.isGuest) this.send({ t: 'setWeather', type });
    else if (this.isHost) this.lastTime = 0;
  }

  sendWind(speed) {
    if (this.isGuest) this.send({ t: 'setWind', speed });
    else if (this.isHost) this.lastTime = 0;
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
    return [...this.remotePlayers.values()].map((rp) => world.chunkXFor(Math.floor((rp.x + rp.width / 2) / TILE_SIZE)));
  }

  keepRadius() {
    return KEEP_CHUNKS_AROUND;
  }

  // The player an item should drift toward and be picked up by: us or a guest.
  nearestPlayer(item, local) {
    if (!this.isHost || this.remotePlayers.size === 0) return local;
    let best = local;
    let bestD = Math.hypot(local.x + local.width / 2 - item.x, local.y + local.height / 2 - item.y);
    for (const rp of this.remotePlayers.values()) {
      const d = Math.hypot(rp.x + rp.width / 2 - item.x, rp.y + rp.height / 2 - item.y);
      if (d < bestD) {
        best = rp;
        bestD = d;
      }
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
        if (this.joinResolve) this.finishJoin({ ok: false, error: msg.reason });
        else this.leaveWith(msg.reason);
        break;
      case 'kicked':
        this.leaveWith(msg.reason || 'You were kicked from the game.');
        break;
      case 'perms': {
        if (!this.settings) break;
        const was = { build: this.settings.allowBuild !== false, commands: this.settings.commands !== false };
        this.settings.allowBuild = !!msg.build;
        this.settings.commands = !!msg.commands;
        if (was.build !== !!msg.build) this.game.toast(msg.build ? 'The host lets you build now.' : 'The host has stopped you building.');
        if (was.commands !== !!msg.commands) this.game.toast(msg.commands ? 'The host lets you use commands now.' : 'The host has stopped you using commands.');
        break;
      }
      case 'welcome': {
        this.myId = msg.you;
        this.settings = msg.settings;
        try {
          const decoded = WorldSerializer.decode(msg.world);
          await this.game.startGuestWorld(decoded, msg.saved, msg.spawn, msg.settings.serverName);
        } catch (e) {
          console.error('Joining failed:', e);
          this.finishJoin({ ok: false, error: "Could not load the host's world: " + e.message });
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
      case 'chat':
        this.game.chat(String(msg.name || '?').slice(0, 20), String(msg.text || '').slice(0, 128), msg.me, validColor(msg.col));
        break;
      case 'color': {
        const rp = this.remotePlayers.get(msg.id);
        if (rp) rp.color = validColor(msg.c);
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
        if (num(msg.wind) !== null) wind.set(msg.wind, true);
        if (typeof msg.weather === 'string') {
          weather.auto = false; // the host decides
          weather.set(msg.weather);
        }
        if (num(msg.snow) !== null) weather.snowCover = Math.max(0, Math.min(1, msg.snow));
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

  // Guest: the host sent us away (kicked, banned): back to the menu with the reason.
  leaveWith(reason) {
    if (this.joinResolve) return this.finishJoin({ ok: false, error: reason });
    this.stop(false);
    this.game.leaveToMenu(reason);
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
      this.send({ t: 'cells', c: entries.map((e) => e[0]) });
      return;
    }
    for (const peer of this.peers.values()) {
      if (!peer.ready) continue;
      const c = entries.filter(([, origin]) => origin !== peer.id).map((e) => e[0]);
      if (c.length) this.send({ t: 'cells', c }, peer.id);
    }
  }

  // --- Every frame -------------------------------------------------------------------

  update(dt) {
    const w = this.game.world;
    if (w) for (const rp of this.remotePlayers.values()) if (rp.dummy) rp.dummyPhysics(dt, w);
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
        const list = this.game.items.map((it) => {
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
        this.send({ t: 'time', time: this.game.world.time, clock: this.game.clock(), wind: wind.speed, weather: weather.type, snow: weather.snowCover });
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
