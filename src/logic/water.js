// Water as an amount per block (like Terraria): every open block holds 0..1 of a block of
// water (a little more when squeezed by the water above it, which is what pushes water up
// the far side of a U-bend). Each tick water falls into the block below, spreads evenly
// with the blocks beside it, and anything squeezed past full rises into the block above.
// Because amounts are shared out rather than moved in whole pieces, still water always
// settles level.
//
// Only loaded chunks are simulated, and only while something is moving: once every flow is
// tiny the sim sleeps until a block changes. Drawing works from the amounts (openMass).
//
// While a chunk is loaded its water lives here; the chunk's cells hold it (as water blocks
// with a mass, or a plant's meta.water) only while unloaded and in saves.

import { ParticleWater } from './particleWater.js';

export const WATER_LEVELS = 16;
export const SQ = 16;             // drawing resolution: water pixels across a block (one per texture pixel)

const MAX_MASS = 1;
const MAX_COMPRESS = 0.02;        // extra a block holds per block of water above it
const MIN_MASS = 0.0005;          // less than this is dried up
const MIN_FLOW = 0.005;           // flows above this are halved, for smoother movement
const MAX_SPEED = 1;              // most water a block passes on in one step
const STEPS = 3;                  // sim steps per tick
const QUIET = 0.0015;             // the sim sleeps after a while with no flow bigger than this
const QUIET_TICKS = 90;

// Water a saved/unloaded cell holds, as a share of a full block.
export function waterMass(cell) {
  if (cell.id !== 'water') return cell.meta?.water || 0;
  const m = cell.meta;
  if (m?.mass !== undefined) return m.mass;
  return m?.level !== undefined ? m.level / WATER_LEVELS : 1;
}

// Visible depth in 1/16ths of a block.
export function waterLevel(cell) {
  if (cell.id !== 'water') return 0;
  return Math.max(1, Math.min(WATER_LEVELS, Math.round(waterMass(cell) * WATER_LEVELS)));
}

// How much of `total` (water in a block and the one below it) the lower block holds.
function stableBelow(total) {
  if (total <= MAX_MASS) return MAX_MASS;
  if (total < 2 * MAX_MASS + MAX_COMPRESS) return (MAX_MASS * MAX_MASS + total * MAX_COMPRESS) / (MAX_MASS + MAX_COMPRESS);
  return (total + MAX_COMPRESS) / 2;
}

export class WaterSim {
  constructor(world) {
    this.world = world;
    this.cs = world.chunkSize;
    this.h = world.height;
    this.size = this.cs * this.h;          // blocks in a chunk
    this.nChunks = world.widthInChunks;
    this.slots = new Map();                // chunkX -> { mass, next, solid, dirty, changed }
    this.awake = false;
    this.quiet = 0;
    this.drops = { n: 0 };                 // (kept for callers; splashes are drawn elsewhere)
    this.particles = new ParticleWater(world, this); // moving water, as fluid particles
  }

  // --- Chunks --------------------------------------------------------------------------

  reset() {
    this.slots.clear();
    this.awake = false;
    this.particles.reset();
  }

  // Is block (tx, ty) closed to water? Background blocks, plants and anything you walk
  // through let water through, like physics.js.
  closed(tx, ty) {
    const world = this.world;
    const cell = world.getCell(tx, ty);
    if (cell.id === 'air' || cell.id === 'water') return false;
    const type = world.registry.get(cell.id);
    if (!type || cell.meta?.layer === 'bg' || cell.meta?.noCollision) return false;
    return typeof type.isSolid === 'function' ? !!type.isSolid(cell.meta || {}) : !!type.solid;
  }

  slotAt(tx) {
    if (tx < 0) return null;
    const cx = Math.floor(tx / this.cs);
    return cx < this.nChunks ? this.slots.get(cx) || null : null;
  }

  index(tx, ty) {
    return ty * this.cs + (tx - Math.floor(tx / this.cs) * this.cs);
  }

  // A chunk loaded: its water (in the cells) moves in here.
  chunkLoaded(cx) {
    const world = this.world;
    if (cx < 0 || cx >= this.nChunks) return;
    const chunk = world.chunks.get(world.chunkKey(cx));
    if (!chunk?.cells) return;
    const slot = { mass: new Float32Array(this.size), next: new Float32Array(this.size), solid: new Uint8Array(this.size), dirty: true, changed: false };
    this.slots.set(cx, slot);
    const { cs } = this;
    for (let ty = 0; ty < this.h; ty++) {
      for (let lx = 0; lx < cs; lx++) {
        const idx = ty * cs + lx;
        slot.solid[idx] = this.closed(cx * cs + lx, ty) ? 1 : 0;
        const c = chunk.cells[idx];
        if (!c) continue;
        const m = waterMass(c);
        if (m <= 0) continue;
        if (!slot.solid[idx]) slot.mass[idx] = m;
        if (c.id === 'water') chunk.cells[idx] = { id: 'air', meta: null };
        else { const meta = { ...c.meta }; delete meta.water; chunk.cells[idx] = { id: c.id, meta }; }
      }
    }
    let totalWater = 0;
    for (let i = 0; i < this.size; i++) if (slot.mass[i] > 0) totalWater += slot.mass[i];
    console.log(`[WaterSim] chunkLoaded(${cx}) totalWaterMass=${totalWater.toFixed(1)}`);
    this.wake();
    this.particles.chunkLoaded(cx);
  }

  // A chunk is unloading: its water goes back into its cells.
  chunkUnloading(cx) {
    const slot = this.slots.get(cx);
    if (!slot) return;
    console.log(`[WaterSim] chunkUnloading(${cx})`);
    this.particles.settle(cx); // its moving water comes to rest first
    const chunk = this.world.chunks.get(this.world.chunkKey(cx));
    if (chunk?.cells) {
      this.depositSlot(cx, slot, chunk, null);
      if (slot.changed) chunk.dirty = true;
    }
    this.slots.delete(cx);
    this.particles.chunkUnloaded(cx);
    this.wake(); // water next door was held back by this chunk's edge
  }

  // Write a chunk's water into its cells (recording what was there in `undo`).
  depositSlot(cx, slot, chunk, undo) {
    const cs = this.cs, h = this.h;
    const masses = new Float32Array(this.size);
    for (let x = 0; x < cs; x++) {
      let carry = 0;
      for (let y = h - 1; y >= 0; y--) {
        const idx = y * cs + x;
        if (slot.solid[idx]) { carry = 0; continue; }
        const total = slot.mass[idx] + this.particles.massAt(cx * cs + x, y) + carry;
        if (total > MAX_MASS) {
          masses[idx] = MAX_MASS;
          carry = total - MAX_MASS;
        } else {
          masses[idx] = total;
          carry = 0;
        }
      }
    }
    for (let idx = 0; idx < this.size; idx++) {
      const m = Math.min(MAX_MASS + MAX_COMPRESS, masses[idx]);
      if (m < 0.01) continue;
      const old = chunk.cells[idx] || { id: 'air', meta: null };
      let next;
      if (old.id === 'air') next = { id: 'water', meta: { mass: m } };
      else if (!slot.solid[idx]) next = { id: old.id, meta: { ...(old.meta || {}), water: m } };
      else continue;
      if (undo) undo.push([chunk, idx, old]);
      chunk.cells[idx] = next;
    }
  }

  // For saving: run fn with all the water written into the cells, then take it back out.
  withDeposited(fn) {
    const undo = [];
    for (const [cx, slot] of this.slots) {
      const chunk = this.world.chunks.get(this.world.chunkKey(cx));
      if (chunk?.cells) this.depositSlot(cx, slot, chunk, undo);
    }
    try {
      return fn();
    } finally {
      for (let u = undo.length - 1; u >= 0; u--) undo[u][0].cells[undo[u][1]] = undo[u][2];
    }
  }

  hasWater() {
    if (this.particles.particleCount()) return true;
    for (const slot of this.slots.values()) {
      for (let i = 0; i < this.size; i++) if (slot.mass[i] > MIN_MASS) return true;
    }
    return false;
  }

  // A block changed at (tx, ty): whether it holds water is updated (water in a block that
  // turned solid is pushed out), water placed there as a block joins in, and the sim wakes.
  blockChanged(tx, ty) {
    const slot = this.slotAt(tx);
    if (!slot || ty < 0 || ty >= this.h) return;
    const world = this.world;
    const cx = Math.floor(tx / this.cs);
    const idx = this.index(tx, ty);
    // Water set as a block (a command, a mod, another player...) joins the sim.
    const c = world.getCell(tx, ty);
    const m = waterMass(c);
    const chunk = world.chunks.get(world.chunkKey(cx));
    if (m > 0 && chunk?.cells) {
      if (c.id === 'water') chunk.cells[idx] = { id: 'air', meta: null };
      else { const meta = { ...c.meta }; delete meta.water; chunk.cells[idx] = { id: c.id, meta }; }
    }
    const solid = this.closed(tx, ty) ? 1 : 0;
    slot.solid[idx] = solid;
    if (solid) {
      const pushed = slot.mass[idx] + m;
      slot.mass[idx] = 0;
      if (pushed > 0) this.spill(tx, ty, pushed);
    } else if (m > 0) {
      slot.mass[idx] += m;
    }
    this.touch(slot);
    this.particles.blockChanged(tx, ty);
  }

  // --- Block amounts, for the particle water -----------------------------------------

  // Water held as a block amount in (tx, ty) (not counting particles).
  blockMass(tx, ty) {
    const s = this.slotAt(tx);
    if (!s || ty < 0 || ty >= this.h) return 0;
    const i = this.index(tx, ty);
    return s.solid[i] ? 0 : s.mass[i];
  }

  // Take all the block-amount water out of (tx, ty) (it's becoming particles).
  takeBlockMass(tx, ty) {
    const s = this.slotAt(tx);
    if (!s || ty < 0 || ty >= this.h) return 0;
    const i = this.index(tx, ty);
    const m = s.mass[i];
    s.mass[i] = 0;
    if (m) this.touch(s);
    return m;
  }

  // Add water to (tx, ty) as a block amount (particles settling); into the nearest open
  // block if that one's closed.
  addBlockMass(tx, ty, m) {
    const s = this.slotAt(tx);
    if (!s || ty < 0 || ty >= this.h) return;
    const i = this.index(tx, ty);
    if (s.solid[i]) { this.spill(tx, ty, m); return; }
    s.mass[i] += m;
    this.touch(s);
  }

  // Put `amount` of water into the open blocks nearest (tx, ty), up first.
  spill(tx, ty, amount) {
    const seen = new Set([tx * 4096 + ty]);
    const queue = [tx, ty];
    for (let q = 0; q < queue.length && amount > 0.0001 && q < 4000; q += 2) {
      const x = queue[q], y = queue[q + 1];
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const nx = x + dx, ny = y + dy, key = nx * 4096 + ny;
        if (seen.has(key) || ny < 0 || ny >= this.h) continue;
        seen.add(key);
        const s = this.slotAt(nx);
        if (!s) continue;
        const i = this.index(nx, ny);
        if (s.solid[i]) continue;
        const put = Math.min(Math.max(0, MAX_MASS - s.mass[i]), amount);
        if (put > 0) { s.mass[i] += put; amount -= put; this.touch(s); }
        queue.push(nx, ny);
      }
    }
  }

  touch(slot) {
    slot.dirty = true;
    slot.changed = true;
    this.wake();
  }

  wake() {
    this.awake = true;
    this.quiet = 0;
  }

  // --- Buckets -------------------------------------------------------------------------

  // A bucket's worth (a full block) poured into block (tx, ty), overflowing into the block
  // above. False if there isn't room for it all.
  pour(tx, ty) {
    if (this.particles.enabled && this.openMass(tx, ty) !== null) return this.particles.pour(tx, ty);
    const room = (x, y) => {
      const s = this.slotAt(x);
      if (!s || y < 0 || y >= this.h) return 0;
      const i = this.index(x, y);
      return s.solid[i] ? 0 : Math.max(0, MAX_MASS - s.mass[i]);
    };
    const here = room(tx, ty), above = room(tx, ty - 1);
    if (here <= 0 || here + above < MAX_MASS - 0.001) return false;
    const s = this.slotAt(tx);
    const i = this.index(tx, ty);
    s.mass[i] += here;
    if (here < MAX_MASS) s.mass[i - this.cs] += MAX_MASS - here;
    this.touch(s);
    return true;
  }

  // Scoop a bucket's worth (a full block) from the water at block (tx, ty), nearest first.
  // 'none' if there's no water there, 'little' if there isn't a full block's worth near.
  take(tx, ty) {
    if (this.massAt(tx, ty) < 0.01) return 'none';
    // Moving water comes to rest as block amounts first, so it can be scooped.
    if (this.particles.particleCount()) this.particles.settle();
    const seen = new Set([tx * 4096 + ty]);
    const found = [tx, ty];
    let total = 0;
    for (let q = 0; q < found.length && total < MAX_MASS && q < 400; q += 2) {
      const x = found[q], y = found[q + 1];
      total += this.massAt(x, y);
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const nx = x + dx, ny = y + dy, key = nx * 4096 + ny;
        if (seen.has(key)) continue;
        seen.add(key);
        if (this.massAt(nx, ny) >= 0.01) found.push(nx, ny);
      }
    }
    if (total < MAX_MASS - 0.001) return 'little';
    let need = MAX_MASS;
    for (let q = 0; q < found.length && need > 0; q += 2) {
      const s = this.slotAt(found[q]);
      const i = this.index(found[q], found[q + 1]);
      const t = Math.min(need, s.mass[i]);
      s.mass[i] -= t;
      need -= t;
      this.touch(s);
    }
    return 'taken';
  }

  // --- Reading -------------------------------------------------------------------------

  // Water in block (tx, ty) as a share of a full block (block amounts and particles).
  massAt(tx, ty) {
    const s = this.slotAt(tx);
    if (!s || ty < 0 || ty >= this.h) return 0;
    return Math.min(MAX_MASS, s.mass[this.index(tx, ty)] + this.particles.massAt(tx, ty));
  }

  // Water in an open block (0..1), or null for a solid or unloaded one.
  openMass(tx, ty) {
    const s = this.slotAt(tx);
    if (!s || ty < 0 || ty >= this.h) return null;
    const i = this.index(tx, ty);
    return s.solid[i] ? null : Math.min(MAX_MASS, s.mass[i]);
  }

  // --- Moving water --------------------------------------------------------------------

  step(dt) {
    if (this.world.remote) return;
    this.particles.step(dt);
    if (!this.awake) return;
    let biggest = 0;
    for (let n = 0; n < STEPS; n++) biggest = Math.max(biggest, this.simulate());
    if (biggest < QUIET) {
      if (++this.quiet >= QUIET_TICKS) this.awake = false;
    } else this.quiet = 0;
  }

  // One step over every loaded chunk. Returns the biggest single flow.
  simulate() {
    const { cs, h, size, slots } = this;
    for (const s of slots.values()) s.next.set(s.mass);
    let biggest = 0;
    for (const [cx, s] of slots) {
      const { mass, next, solid } = s;
      const left = slots.get(cx - 1), right = slots.get(cx + 1);
      for (let ty = 0; ty < h; ty++) {
        const row = ty * cs;
        for (let lx = 0; lx < cs; lx++) {
          const i = row + lx;
          const m = mass[i];
          if (m <= 0 || solid[i]) continue;
          let remaining = m;
          // Down.
          if (ty + 1 < h && !solid[i + cs]) {
            const b = mass[i + cs];
            let f = stableBelow(remaining + b) - b;
            if (f > MIN_FLOW) f *= 0.5;
            f = Math.max(0, Math.min(f, MAX_SPEED, remaining));
            if (f > 0) { next[i] -= f; next[i + cs] += f; remaining -= f; if (f > biggest) biggest = f; }
          }
          if (remaining <= 0) continue;
          // Sideways: even out with each neighbour (across chunk edges too).
          for (let d = -1; d <= 1; d += 2) {
            let ns = s, ni = i + d;
            if (lx + d < 0) { ns = left; ni = row + cs - 1; } else if (lx + d >= cs) { ns = right; ni = row; }
            if (!ns || ns.solid[ni]) continue;
            let f = (m - ns.mass[ni]) / 4;
            if (f > MIN_FLOW) f *= 0.5;
            f = Math.max(0, Math.min(f, remaining));
            if (f > 0) { next[i] -= f; ns.next[ni] += f; remaining -= f; if (f > biggest) biggest = f; if (ns !== s) ns.changed = true; }
          }
          if (remaining <= 0) continue;
          // Up: only what's squeezed past what this block can hold.
          if (ty > 0 && !solid[i - cs]) {
            let f = remaining - stableBelow(remaining + mass[i - cs]);
            if (f > MIN_FLOW) f *= 0.5;
            f = Math.max(0, Math.min(f, MAX_SPEED, remaining));
            if (f > 0) { next[i] -= f; next[i - cs] += f; if (f > biggest) biggest = f; }
          }
        }
      }
    }
    for (const s of slots.values()) {
      const { mass, next } = s;
      let moved = false;
      for (let i = 0; i < size; i++) {
        const v = next[i] < MIN_MASS ? 0 : next[i];
        if (v !== mass[i]) { mass[i] = v; moved = true; }
      }
      if (moved) { s.changed = true; s.dirty = true; }
    }
    return biggest;
  }

  // --- Multiplayer ---------------------------------------------------------------------

  // Chunks whose water changed (or all with water, when `full`), as [chunkX, 0, amounts]
  // for guests, who don't simulate water but draw what the host sends.
  netRegions(full) {
    const out = [];
    const moving = this.particles.particleCount() > 0;
    for (const [cx, s] of this.slots) {
      if (!full && !s.dirty && !moving) continue;
      s.dirty = false;
      const bytes = new Uint8Array(this.size);
      let anyWater = false;
      for (let i = 0; i < this.size; i++) {
        const v = Math.round(Math.min(MAX_MASS, s.mass[i] + this.particles.massAt(cx * this.cs + i % this.cs, Math.floor(i / this.cs))) * 255);
        bytes[i] = v;
        if (v) anyWater = true;
      }
      if (full && !anyWater) continue;
      let str = '';
      for (let k = 0; k < bytes.length; k++) str += String.fromCharCode(bytes[k]);
      out.push([cx, 0, btoa(str)]);
    }
    return out;
  }

  netApply(regions) {
    for (const [cx, , data] of regions) {
      const s = this.slots.get(cx);
      if (!s) continue;
      let str;
      try { str = atob(data); } catch { continue; }
      for (let i = 0; i < this.size && i < str.length; i++) s.mass[i] = s.solid[i] ? 0 : str.charCodeAt(i) / 255;
    }
  }
}
