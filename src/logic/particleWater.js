// Particle water: moving water simulated as LiquidFun particles (real fluid: momentum,
// waves, splashes), on top of the block-amount water in water.js.
//
// All water in loaded chunks is particles. water.js keeps it as an amount per block only
// while its chunk is unloaded (and for saves): when a chunk loads, its water turns into
// particles; when it unloads, the particles there are counted per block and stored.
//
// 1 block = 1 metre in the particle world, y pointing down like the game.

const RADIUS = 0.15;              // particle radius in blocks (~30 particles/block at equilibrium)
const MAX_PARTICLES = 12000;      // max active particles for real-time 60 FPS physics
const MAX_BODY = 3000;            // most blocks of water woken up at once
const SAFETY_SPEED = 9;           // blocks/s: prevents supersonic launch explosions
const SWEEP_TICKS = 20;           // how often block-amount water is looked for and woken
const SETTLE_TICKS = 90;          // ticks after waking water: extra damping while it settles
const COLLIDE_MARGIN = 3;         // blocks around the water given collision shapes

import { waterPerf } from '../core/waterPerf.js';

let Box2D = null;
let loading = null;

// Load LiquidFun once (it's a WebAssembly module); until it's ready, water stays as blocks.
export function loadParticleEngine() {
  if (!loading) {
    loading = import('../lib/liquidfun/entry.js')
      .then((m) => m.default({ locateFile: (f) => new URL(`../lib/liquidfun/${f}`, import.meta.url).href }))
      .then((b) => { Box2D = b; return b; })
      .catch((e) => { console.warn('Particle water unavailable:', e); return null; });
  }
  return loading;
}

export class ParticleWater {
  constructor(world, sim) {
    this.world = world;
    this.sim = sim;                // the block-amount water (water.js)
    this.ready = false;
    this.count = new Map();        // block key -> particles in it (refreshed every tick)
    this.tick = 0;
    this.fixtures = new Map();     // chunk x -> its collision fixtures
    loadParticleEngine().then((b) => { if (b) this.init(b); });
  }

  init(B) {
    this.B = B;
    this.pw = new B.b2World(new B.b2Vec2(0, 10));
    this.ground = this.pw.CreateBody(new B.b2BodyDef());
    const def = new B.b2ParticleSystemDef();
    def.radius = RADIUS;
    def.dampingStrength = 1.2;
    def.viscousStrength = 0.20;
    def.pressureStrength = 0.60;
    def.maxCount = 0;
    this.ps = this.pw.CreateParticleSystem(def);
    this.shape = new B.b2PolygonShape();
    this.pdef = new B.b2ParticleDef();
    this.pdef.flags = B.b2_waterParticle;
    this.pgd = new B.b2ParticleGroupDef();
    this.pgd.flags = B.b2_waterParticle;
    this.pgd.stride = 2 * RADIUS * 0.61;
    this.vec = new B.b2Vec2(0, 0);
    this.perBlock = 30;
    this.fixtures = new Map();
    for (const cx of this.sim.slots.keys()) this.buildChunk(cx);
    this.updateWalls();
    this.ready = true;
  }

  get enabled() {
    return this.ready && !this.world.remote;
  }

  key(tx, ty) { return tx * 4096 + ty; }

  // Create a box of water particles using LiquidFun's native particle group generator
  createWaterBox(x0, y0, x1, y1) {
    if (x0 >= x1 || y0 >= y1) return 0;
    const hx = (x1 - x0) / 2, hy = (y1 - y0) / 2;
    this.vec.set_x(x0 + hx);
    this.vec.set_y(y0 + hy);
    this.shape.SetAsBox(hx, hy, this.vec, 0);
    this.ps.DestroyParticlesInShape(this.shape, this.ground.GetTransform());
    this.pgd.shape = this.shape;
    const before = this.ps.GetParticleCount();
    this.ps.CreateParticleGroup(this.pgd);
    return this.ps.GetParticleCount() - before;
  }

  clearAll() {
    this.vec.set_x(0); this.vec.set_y(0);
    this.shape.SetAsBox(1e6, 1e6, this.vec, 0);
    this.ps.DestroyParticlesInShape(this.shape, this.ground.GetTransform());
    this.zombies = true;
  }

  // LiquidFun only removes destroyed particles on its next step (and stepping early, with a
  // tiny time, flings the water: its pressure scales with 1 / time). Until then they're
  // still in the buffers, flagged: this says whether particle i is really there.
  alive(i) {
    return !this.zombies || !(this.ps.GetParticleFlags(i) & this.B.b2_zombieParticle);
  }

  // Particles there are (destroyed ones waiting to be removed aren't counted).
  particleCount() {
    if (!this.ready) return 0;
    const n = this.ps.GetParticleCount();
    if (!this.zombies) return n;
    let alive = 0;
    for (let i = 0; i < n; i++) if (this.alive(i)) alive++;
    return alive;
  }

  // Positions as a Float32Array view [x0, y0, x1, y1, ...] (valid until the next step).
  positions() {
    const n = this.ready ? this.ps.GetParticleCount() : 0;
    if (!n) return null;
    const p = this.B.getPointer(this.ps.GetPositionBuffer()) >> 2;
    return this.B.HEAPF32.subarray(p, p + n * 2);
  }

  // Water held as particles in block (tx, ty), as a share of a full block.
  massAt(tx, ty) {
    const c = this.count.get(this.key(tx, ty));
    return c ? c / this.perBlock : 0;
  }

  // --- Waking water up ---------------------------------------------------------------

  wakeUp() {
    this.sleeping = false;
    this.stillTicks = 0;
  }

  // Something changed at block (tx, ty): the water touching it starts moving as particles.
  disturb(tx, ty) {
    this.wakeUp();
    if (!this.enabled) return;
    for (const [dx, dy] of [[0, 0], [0, -1], [-1, 0], [1, 0], [0, 1]]) {
      if (this.sim.blockMass(tx + dx, ty + dy) > 0.01) { this.wake(tx + dx, ty + dy); return; }
    }
  }

  // Turn the body of block-amount water joined to (tx, ty) into particles.
  wake(tx, ty) {
    this.wakeUp();
    if (!this.enabled || this.ps.GetParticleCount() >= MAX_PARTICLES) return;
    const seen = new Set([this.key(tx, ty)]);
    const queue = [tx, ty];
    for (let q = 0; q < queue.length && q < MAX_BODY * 2; q += 2) {
      const x = queue[q], y = queue[q + 1];
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const nx = x + dx, ny = y + dy, k = this.key(nx, ny);
        if (seen.has(k)) continue;
        seen.add(k);
        if (this.sim.blockMass(nx, ny) > 0.01) queue.push(nx, ny);
      }
    }
    const budget = Math.floor((MAX_PARTICLES - this.ps.GetParticleCount()) / this.perBlock);
    if (budget <= 0) return;

    // Group blocks by column x to form 2D contiguous boxes
    const byCol = new Map();
    let count = 0;
    for (let q = 0; q < queue.length && q < MAX_BODY * 2 && count < budget; q += 2) {
      const x = queue[q], y = queue[q + 1];
      const all = this.sim.takeBlockMass(x, y);
      const m = Math.min(1, all);
      if (m <= 0.01) continue;
      count++;
      let col = byCol.get(x);
      if (!col) { col = []; byCol.set(x, col); }
      col.push({ y, m });
    }

    if (count === 0) return;

    // Convert each column to vertical spans
    const colSpans = new Map();
    for (const [x, list] of byCol) {
      list.sort((a, b) => a.y - b.y);
      const spans = [];
      let i = 0;
      while (i < list.length) {
        let j = i;
        while (j + 1 < list.length && list[j + 1].y === list[j].y + 1 && Math.abs(list[j + 1].m - list[i].m) < 0.05) j++;
        spans.push({ y0: list[i].y + 1 - list[i].m, y1: list[j].y + 1 });
        i = j + 1;
      }
      colSpans.set(x, spans);
    }

    // Merge adjacent columns with matching vertical spans into unified 2D boxes
    const xs = [...colSpans.keys()].sort((a, b) => a - b);
    let madeAny = 0;
    let i = 0;
    while (i < xs.length) {
      const x0 = xs[i];
      const s0 = colSpans.get(x0);
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) {
        const sj = colSpans.get(xs[j + 1]);
        if (s0.length === sj.length && s0.every((sp, idx) => Math.abs(sp.y0 - sj[idx].y0) < 0.05 && Math.abs(sp.y1 - sj[idx].y1) < 0.05)) j++;
        else break;
      }
      const x1 = xs[j] + 1;
      for (const sp of s0) {
        madeAny += this.createWaterBox(x0, sp.y0, x1, sp.y1);
      }
      i = j + 1;
    }
    if (madeAny > 0) {
      this.settling = Math.max(this.settling || 0, SETTLE_TICKS);
    }
  }

  // A full block of water (a bucket) poured into block (tx, ty) as particles.
  pour(tx, ty) {
    this.wakeUp();
    if (!this.enabled) return false;
    this.createWaterBox(tx, ty, tx + 1, ty + 1);
    this.disturb(tx, ty);
    return true;
  }

  // --- Settling back -----------------------------------------------------------------

  // Hand particles back as block amounts: all of them, or only those in chunk `onlyChunk`.
  settle(onlyChunk = null) {
    if (!this.ready) return;
    const n = this.ps.GetParticleCount();
    if (!n) return;
    const pos = this.positions();
    const cs = this.world.chunkSize;
    const amounts = new Map();
    const doomed = [];
    const minX = onlyChunk !== null ? onlyChunk * cs : -Infinity;
    const maxX = onlyChunk !== null ? (onlyChunk + 1) * cs : Infinity;

    for (let i = 0; i < n; i++) {
      if (!this.alive(i)) continue;
      const px = pos[i * 2], py = pos[i * 2 + 1];
      if (onlyChunk !== null && (px < minX || px >= maxX)) continue;
      const tx = Math.floor(px), ty = Math.floor(py);
      const k = `${tx},${ty}`;
      amounts.set(k, (amounts.get(k) || 0) + 1);
      doomed.push(i);
    }
    for (const [k, c] of amounts) {
      const comma = k.indexOf(',');
      const tx = parseInt(k.slice(0, comma), 10);
      const ty = parseInt(k.slice(comma + 1), 10);
      this.sim.addBlockMass(tx, ty, c / this.perBlock);
    }
    if (onlyChunk === null) this.clearAll();
    else {
      for (let d = doomed.length - 1; d >= 0; d--) this.ps.DestroyParticle(doomed[d]);
      this.zombies = true;
    }
    this.count.clear();
  }

  // --- Each tick -----------------------------------------------------------------------

  step(dt) {
    if (!this.ready) return;
    waterPerf.startSim();
    try {
      if (!this.enabled) { if (this.ps.GetParticleCount()) this.settle(); return; }
      this.tick++;
      // All water in loaded chunks is particles: any held as block amounts (just loaded, set
      // by a command, pushed out by a block...) is woken up.
      if (this.tick % SWEEP_TICKS === 1) this.sweep();
      const n = this.ps.GetParticleCount();
      waterPerf.setCounts({
        totalParticles: n,
        fixturesCount: this.fixtures.size
      });
      if (!n) {
        this.count.clear();
        if (this.wallsDirty) { this.wallsDirty = false; this.updateWalls(); }
        return;
      }

      const vel = this.B.HEAPF32.subarray(this.B.getPointer(this.ps.GetVelocityBuffer()) >> 2);

      let maxSpSq = 0;
      waterPerf.time('simVelDamp', () => {
        if (this.settling > 0) {
          this.settling--;
          // Smooth vertical damping during settling to prevent geyser bounces while preserving horizontal leveling flow
          const damp = 0.88 + 0.11 * (1 - this.settling / SETTLE_TICKS);
          for (let i = 0, m = n * 2; i < m; i += 2) {
            const vx = (vel[i] *= 0.99); // allow horizontal flow across steps and lake
            let vy = vel[i + 1] * damp;
            if (vy < -0.4) vy = -0.4; // prevent geyser eruption while allowing hydrostatic level recovery
            vel[i + 1] = vy;
            const spSq = vx * vx + vy * vy;
            if (spSq > maxSpSq) maxSpSq = spSq;
          }
        } else {
          // Natural fluid viscosity drag
          for (let i = 0, m = n * 2; i < m; i += 2) {
            const vx = (vel[i] *= 0.995);
            const vy = (vel[i + 1] *= 0.995);
            const spSq = vx * vx + vy * vy;
            if (spSq > maxSpSq) maxSpSq = spSq;
          }
        }
      });

      // Sleep dormant pools when settled and motionless (saves ~1-3ms per frame)
      if (this.settling === 0) {
        if (maxSpSq < 0.005) {
          this.stillTicks = (this.stillTicks || 0) + 1;
          if (this.stillTicks >= 20) {
            this.sleeping = true;
            if (!this.count.size) {
              const p = this.positions();
              if (p) {
                for (let i = 0; i < n; i++) {
                  const k = this.key(Math.floor(p[i * 2]), Math.floor(p[i * 2 + 1]));
                  this.count.set(k, (this.count.get(k) || 0) + 1);
                }
              }
            }
          }
        } else {
          this.stillTicks = 0;
          this.sleeping = false;
        }
      } else {
        this.stillTicks = 0;
        this.sleeping = false;
      }

      if (this.sleeping) {
        vel.fill(0);
        return;
      }

      // Step physics at 45Hz rate with accumulator
      const PHYS_HZ = 45;
      const PHYS_DT = 1 / PHYS_HZ;
      this.physAccum = (this.physAccum || 0) + (typeof dt === 'number' && dt > 0 ? dt : 1 / 60);
      if (this.physAccum > 0.1) this.physAccum = PHYS_DT;
      if (this.physAccum < PHYS_DT) return;
      this.physAccum -= PHYS_DT;

      waterPerf.time('simWasm', () => {
        this.pw.Step(PHYS_DT, 1, 1, 1);
      });
      this.zombies = false; // the step removed any destroyed particles

      // Fast safety velocity cap using squared magnitude
      waterPerf.time('simSafetyCap', () => {
        const maxSp = this.settling > 0 ? 3.0 : SAFETY_SPEED;
        const maxSpSq = maxSp * maxSp;
        for (let i = 0, m = n * 2; i < m; i += 2) {
          if (this.settling > 0 && vel[i + 1] < -0.4) vel[i + 1] = -0.4;
          const spSq = vel[i] * vel[i] + vel[i + 1] * vel[i + 1];
          if (spSq > maxSpSq) {
            const inv = maxSp / Math.sqrt(spSq);
            vel[i] *= inv;
            vel[i + 1] *= inv;
          }
        }
      });

      let pos;
      waterPerf.time('simPosExtract', () => {
        pos = this.positions();
      });
      if (!pos) return;

      // Destroy out-of-bounds particles and update block count map every 5 ticks
      waterPerf.time('simOobCleanup', () => {
        const needCount = (this.tick % 5 === 0);
        if (needCount) this.count.clear();
        const count = this.count;
        for (let i = this.ps.GetParticleCount() - 1; i >= 0; i--) {
          const x = pos[i * 2], y = pos[i * 2 + 1];
          const tx = Math.floor(x), ty = Math.floor(y);
          if (!Number.isFinite(x) || !Number.isFinite(y) || ty >= this.world.height || ty < -50 || !this.world.isChunkLoaded(this.world.chunkXFor(Math.max(0, tx)))) {
            this.ps.DestroyParticle(i);
            continue;
          }
          // When a moving particle lands in a body of block water, it dissolves into the block mass
          if (this.sim.blockMass(tx, ty) > 0.01) {
            this.sim.addBlockMass(tx, ty, 1 / this.perBlock);
            this.ps.DestroyParticle(i);
            continue;
          }
          if (needCount) {
            const k = this.key(tx, ty);
            count.set(k, (count.get(k) || 0) + 1);
          }
        }
      });
    } finally {
      waterPerf.endSim();
    }
  }

  // Wake every body of block-amount water in the loaded chunks.
  sweep() {
    for (const cx of this.sim.slots.keys()) this.sweepChunk(cx);
  }

  sweepChunk(cx) {
    const slot = this.sim.slots.get(cx);
    if (!slot) return;
    const cs = this.world.chunkSize;
    for (let i = 0; i < slot.mass.length; i++) {
      if (slot.mass[i] > 0.01 && !slot.solid[i]) this.wake(cx * cs + i % cs, Math.floor(i / cs));
    }
  }

  // --- Terrain -------------------------------------------------------------------------

  // Collision: every loaded chunk's solid blocks, merged into as few big rectangles as
  // possible (particles squeezed into the seams between neighbouring boxes get shoved out).
  // Built when a chunk loads, rebuilt when a block in it changes, removed when it unloads,
  // so the water always has ground under it.
  buildChunk(cx) {
    waterPerf.time('simTerrainFixtures', () => {
      this.dropChunk(cx);
      const cs = this.world.chunkSize, h = this.world.height, x0 = cx * cs;
      if (!this.world.isChunkLoaded(cx)) return;
      const solid = new Uint8Array(cs * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < cs; x++) solid[y * cs + x] = this.sim.closed(x0 + x, y) ? 1 : 0;
      const used = new Uint8Array(cs * h);
      const list = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < cs; x++) {
          if (!solid[y * cs + x] || used[y * cs + x]) continue;
          let xe = x;
          while (xe + 1 < cs && solid[y * cs + xe + 1] && !used[y * cs + xe + 1]) xe++;
          let ye = y;
          grow: while (ye + 1 < h) {
            for (let k = x; k <= xe; k++) if (!solid[(ye + 1) * cs + k] || used[(ye + 1) * cs + k]) break grow;
            ye++;
          }
          for (let yy = y; yy <= ye; yy++) for (let k = x; k <= xe; k++) used[yy * cs + k] = 1;
          const hx = (xe - x + 1) / 2, hy = (ye - y + 1) / 2;
          this.vec.set_x(x0 + x + hx);
          this.vec.set_y(y + hy);
          this.shape.SetAsBox(hx, hy, this.vec, 0);
          list.push(this.ground.CreateFixture(this.shape, 0));
        }
      }
      this.fixtures.set(cx, list);
    });
  }

  dropChunk(cx) {
    const list = this.fixtures.get(cx);
    if (!list) return;
    for (const f of list) this.ground.DestroyFixture(f);
    this.fixtures.delete(cx);
  }

  chunkLoaded(cx) {
    this.wakeUp();
    if (!this.ready) return;
    this.buildChunk(cx);
    this.updateWalls();
  }

  chunkUnloaded(cx) {
    this.wakeUp();
    if (!this.ready) return;
    this.dropChunk(cx);
    this.updateWalls();
    this.settling = Math.max(this.settling || 0, 45);
  }

  // Unloaded chunks next to loaded ones are walled off when moving particles exist,
  // so particles at the edge of the loaded area stop there instead of falling out.
  updateWalls() {
    waterPerf.time('simTerrainFixtures', () => {
      this.walls ??= new Map();
      if (!this.particleCount()) {
        if (this.walls.size) {
          for (const [cx, f] of this.walls) this.ground.DestroyFixture(f);
          this.walls.clear();
        }
        return;
      }
      const loaded = (cx) => this.sim.slots.has(cx);
      const want = new Set();
      for (const cx of this.sim.slots.keys()) for (const n of [cx - 1, cx + 1]) if (!loaded(n)) want.add(n);
      const removed = [], added = [];
      for (const [cx, f] of this.walls) if (!want.has(cx)) { this.ground.DestroyFixture(f); this.walls.delete(cx); removed.push(cx); }
      const cs = this.world.chunkSize, h = this.world.height;
      for (const cx of want) {
        if (this.walls.has(cx)) continue;
        this.vec.set_x(cx * cs + cs / 2);
        this.vec.set_y(h / 2);
        this.shape.SetAsBox(cs / 2, h / 2 + 50, this.vec, 0);
        this.walls.set(cx, this.ground.CreateFixture(this.shape, 0));
        added.push(cx);
      }
      if (added.length || removed.length) {
        console.log(`[ParticleWater] updateWalls added:[${added}] removed:[${removed}] activeWalls:[${[...this.walls.keys()]}]`);
      }
    });
  }

  // A block changed: its collision box follows, particles inside a new solid block are
  // pushed out (they go back as block amounts nearby), and the water around it wakes.
  blockChanged(tx, ty) {
    this.wakeUp();
    if (!this.ready) return;
    if (this.ps.GetParticleCount() && this.sim.closed(tx, ty)) {
      const inside = this.count.get(this.key(tx, ty)) || 0;
      this.vec.set_x(tx + 0.5); this.vec.set_y(ty + 0.5);
      this.shape.SetAsBox(0.5, 0.5, this.vec, 0);
      this.ps.DestroyParticlesInShape(this.shape, this.ground.GetTransform());
      this.zombies = true;
      this.count.delete(this.key(tx, ty));
      if (inside) this.sim.spill(tx, ty, inside / this.perBlock);
    }
    this.buildChunk(this.world.chunkXFor(tx));
    this.disturb(tx, ty);
  }

  reset() {
    if (!this.ready) return;
    this.clearAll();
    for (const cx of [...this.fixtures.keys()]) this.dropChunk(cx);
    for (const f of (this.walls || new Map()).values()) this.ground.DestroyFixture(f);
    this.walls = new Map();
    this.count.clear();
  }
}
