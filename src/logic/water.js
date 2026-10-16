// Water as a mass-based cellular simulation: every water cell holds a mass (1 = a full
// block; deep water is very slightly compressed, which is what pushes water back up the
// other side of a U-bend or out of a hole). Each step a cell pours down, shares with its
// sides and lets compressed water rise, with flows halved so motion stays smooth instead
// of sloshing. Only "awake" cells are simulated, so still lakes cost nothing.

export const WATER_LEVELS = 16;
const MAX_UPDATES_PER_STEP = 5000;
const MAX_MASS = 1;
const MAX_COMPRESS = 0.02;
const MIN_MASS = 0.03;     // less than this dries up
const MIN_FLOW = 0.005;
const MAX_SPEED = 0.5;    // most mass a cell passes down or up per step
const SIDE_RATE = 0.25;    // share of the difference evened out with each side per step
const MIN_SPREAD = 0.1;    // thinner than this doesn't creep across flat ground
const LEVEL_RATE = 0.08;  // share of each column's height difference from its pool's mean moved per step
const MAX_POOL_WIDTH = 160;
const WAKE_DELTA = 0.0005; // smaller changes let the cell (and its neighbours) sleep

// Water flows through anything you can walk through (plants, leaves, torches, background
// blocks...): it's kept in that block's meta.water and drawn in front of it.
export function waterMass(cell) {
  if (cell.id !== 'water') return cell.meta?.water || 0;
  const m = cell.meta;
  if (m?.mass !== undefined) return m.mass;
  return m?.level !== undefined ? m.level / WATER_LEVELS : MAX_MASS;
}

// Visible depth in 1/16ths of a block.
export function waterLevel(cell) {
  if (cell.id !== 'water') return 0;
  return Math.max(1, Math.min(WATER_LEVELS, Math.round(waterMass(cell) * WATER_LEVELS)));
}

// How much of a two-cell stack's total mass the lower cell holds when at rest.
function stableBelow(total) {
  if (total <= MAX_MASS) return MAX_MASS;
  if (total < 2 * MAX_MASS + MAX_COMPRESS) return (MAX_MASS * MAX_MASS + total * MAX_COMPRESS) / (MAX_MASS + MAX_COMPRESS);
  return (total + MAX_COMPRESS) / 2;
}

export class WaterSim {
  constructor(world) {
    this.world = world;
    this.active = new Set();
  }

  key(x, y) {
    return x * 4096 + y;
  }

  wake(x, y) {
    if (this.world.inBounds(x, y) && waterMass(this.world.getCell(x, y)) > 0) this.active.add(this.key(x, y));
  }

  // A block changed at (x, y): wake any water there or next to it.
  wakeAround(x, y) {
    this.wake(x, y);
    this.wake(x - 1, y);
    this.wake(x + 1, y);
    this.wake(x, y - 1);
    this.wake(x, y + 1);
  }

  canHold(x, y) {
    const world = this.world;
    if (!world.inBounds(x, y)) return false;
    // Unloaded chunks read as air; never pour into them or lakes drain into the void.
    if (!world.chunks.get(world.chunkKey(Math.floor(x / world.chunkSize)))) return false;
    const cell = world.getCell(x, y);
    if (cell.id === 'air' || cell.id === 'water') return true;
    // Tree trunks you walk past and background blocks count as behind the water.
    return cell.meta?.noCollision || cell.meta?.layer === 'bg' || !world.isSolidAt(x, y);
  }

  // Mass at (x, y); during a step this reads the step's working copy.
  mass(x, y) {
    const k = this.key(x, y);
    if (this._m?.has(k)) return this._m.get(k);
    return waterMass(this.world.getCell(x, y));
  }

  step() {
    if (this.active.size === 0) return;
    const keys = [...this.active];
    this.active.clear();
    // Bottom rows first, so in the gravity pass a whole column drops together.
    keys.sort((a, b) => (b % 4096) - (a % 4096));
    if (keys.length > MAX_UPDATES_PER_STEP) {
      for (const k of keys.splice(MAX_UPDATES_PER_STEP)) this.active.add(k);
    }
    const m = this._m = new Map();
    const busy = new Set();
    const transfer = (from, to, amount) => {
      m.set(from, this.mass(Math.floor(from / 4096), from % 4096) - amount);
      m.set(to, this.mass(Math.floor(to / 4096), to % 4096) + amount);
      if (amount >= WAKE_DELTA) { busy.add(from); busy.add(to); }
    };

    // 1. Gravity, applied cell by cell from the bottom up: each cell pours into the one
    //    below as far as it holds at rest. Water above a cell that just emptied follows it
    //    down in the same step, so a draining column never leaves floating water behind.
    const fell = new Set();
    const pour = (x, y) => {
      const k = this.key(x, y);
      if (fell.has(k)) return false;
      fell.add(k);
      const mass = this.mass(x, y);
      if (mass <= 0 || !this.canHold(x, y + 1)) return false;
      const below = this.mass(x, y + 1);
      let f = Math.min(stableBelow(mass + below) - below, mass);
      if (f <= 0 || (f < MIN_MASS && below === 0)) return false;
      if (mass - f < MIN_MASS) f = mass;
      transfer(k, this.key(x, y + 1), f);
      return true;
    };
    for (const k of keys) {
      const x = Math.floor(k / 4096);
      // The water above follows straight away, even if it was asleep.
      for (let y = k % 4096; y > 0 && pour(x, y) && this.mass(x, y - 1) > 0; y--);
    }

    // 2. Sideways and upward flows, all worked out from the same masses and then applied
    //    together, so the order cells are visited in doesn't push water to one side.
    const delta = new Map();
    const add = (k, v) => {
      delta.set(k, (delta.get(k) || 0) + v);
      if (Math.abs(v) >= WAKE_DELTA) busy.add(k);
    };
    for (const k of keys) this.spread(Math.floor(k / 4096), k % 4096, k, add);
    for (const [k, d] of delta) m.set(k, this.mass(Math.floor(k / 4096), k % 4096) + d);

    // 3. Level the surface of each connected pool (see levelSurfaces).
    this.levelSurfaces(keys, m, busy);

    // Write the results back to the world.
    this._m = null;
    const scraps = [];
    for (const [k, mass] of m) {
      const x = Math.floor(k / 4096), y = k % 4096;
      if (Math.abs(mass - this.mass(x, y)) < 1e-7) continue;
      if (mass > 1e-6 && mass < MIN_MASS) scraps.push(x, y, mass);
      this.setMass(x, y, mass, false);
    }
    // A cell left with a scrap (it poured out as a trickle came in) hands it to water next
    // to it, so no water is lost.
    for (let i = 0; i < scraps.length; i += 3) {
      const x = scraps[i], y = scraps[i + 1];
      for (const [nx, ny] of [[x, y + 1], [x - 1, y], [x + 1, y], [x, y - 1]]) {
        const n = this.mass(nx, ny);
        if (n > 0) { this.setMass(nx, ny, n + scraps[i + 2], true); break; }
      }
    }
    // Anything that moved a real amount (even if it got as much as it gave) stays awake.
    for (const k of busy) this.wakeAround(Math.floor(k / 4096), k % 4096);
  }

  // Top row of resting water in column x near row y, or -1.
  surfaceRow(x, y) {
    for (let r = y - 4; r <= y + 8; r++) {
      if (this.mass(x, r) <= 0 || this.mass(x, r - 1) > 0) continue;
      const restingOn = !this.canHold(x, r + 1) || this.mass(x, r + 1) >= 0.5;
      return restingOn ? r : -1;
    }
    return -1;
  }

  // Cell-by-cell flow only evens out a sloped surface slowly (it can only pass water
  // sideways a row at a time). This finds the connected surface of each pool, works out
  // its mean height, and moves a share of each column's difference from the mean from
  // high columns to low ones, so pools settle level in a second or so whatever their size.
  levelSurfaces(keys, m, busy) {
    const done = new Set();
    for (const k of keys) {
      const x0 = Math.floor(k / 4096), y0 = k % 4096;
      if (done.has(x0) || this.mass(x0, y0) <= 0 || this.mass(x0, y0 - 1) > 0) continue;
      const r0 = this.surfaceRow(x0, y0);
      if (r0 < 0) continue;
      const cols = [[x0, r0]];
      for (const dir of [1, -1]) {
        let px = x0, pr = r0;
        while (cols.length < MAX_POOL_WIDTH) {
          const x = px + dir;
          if (done.has(x)) break;
          const r = this.surfaceRow(x, pr);
          if (r < 0) break;
          // The two columns must share water at the lower of their two surfaces, or the
          // higher one must be able to spill straight across (a puddle on a beach a block
          // above the lake is still one pool with it).
          const low = Math.max(r, pr), high = Math.min(r, pr);
          const shared = this.mass(px, low) > 0 && this.mass(x, low) > 0;
          const lowCol = r > pr ? x : px;
          const spills = low - high === 1 && this.canHold(lowCol, high) && this.mass(lowCol, high) === 0;
          if (!shared && !spills) break;
          cols.push([x, r]);
          px = x; pr = r;
        }
      }
      for (const [x] of cols) done.add(x);
      if (cols.length < 2) continue;
      // Surface height in blocks, measured downward (bigger = lower).
      const heights = cols.map(([x, r]) => r + 1 - Math.min(1, this.mass(x, r)));
      const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
      let give = 0, want = 0;
      const amounts = heights.map((h, i) => {
        const d = (h - mean) * LEVEL_RATE;
        if (d < 0) {
          const g = Math.min(-d, this.mass(cols[i][0], cols[i][1]));
          give += g;
          return -g;
        }
        want += d;
        return d;
      });
      const moved = Math.min(give, want);
      if (moved < 1e-5) continue;
      for (let i = 0; i < cols.length; i++) {
        const [x, r] = cols[i];
        const a = amounts[i] < 0 ? amounts[i] * (moved / give) : amounts[i] * (moved / want);
        if (Math.abs(a) < 1e-9) continue;
        const k1 = this.key(x, r);
        let v = this.mass(x, r) + a;
        if (v > 1 && this.canHold(x, r - 1)) {
          // Overflow into the cell above.
          const k2 = this.key(x, r - 1);
          m.set(k2, this.mass(x, r - 1) + (v - 1));
          busy.add(k2);
          v = 1;
        }
        m.set(k1, Math.max(0, v));
        if (Math.abs(a) >= WAKE_DELTA) busy.add(k1);
      }
    }
  }

  spread(x, y, k, add) {
    const mass = this.mass(x, y);
    if (mass <= 0) return;
    let remaining = mass;
    const move = (tx, ty, amount) => {
      if (amount <= 0) return;
      // Too little to make a new cell of water: keep it rather than lose it.
      if (amount < MIN_MASS && this.mass(tx, ty) === 0) return;
      // Don't leave a scrap behind that would just dry up: take it all along.
      if (remaining - amount < MIN_MASS) amount = remaining;
      add(k, -amount);
      add(this.key(tx, ty), amount);
      remaining -= amount;
    };

    // Sideways: even out with each neighbour. Thin water on flat ground stays put, but
    // still spills over an edge.
    for (const dx of Math.random() < 0.5 ? [-1, 1] : [1, -1]) {
      const nx = x + dx;
      if (!this.canHold(nx, y)) continue;
      const n = this.mass(nx, y);
      if (n === 0 && remaining < MIN_SPREAD) {
        const overEdge = this.canHold(nx, y + 1) && this.mass(nx, y + 1) < MAX_MASS;
        if (!overEdge) continue;
      }
      const f = (mass - n) * SIDE_RATE;
      move(nx, y, Math.max(0, Math.min(f, remaining)));
      if (remaining <= 0) return;
    }

    // Up: compressed water pushes into the cell above.
    if (this.canHold(x, y - 1)) {
      const above = this.mass(x, y - 1);
      let f = remaining - stableBelow(remaining + above);
      if (f > MIN_FLOW) f *= 0.5;
      move(x, y - 1, Math.max(0, Math.min(f, MAX_SPEED, remaining)));
    }
  }

  setMass(x, y, mass, wake) {
    const world = this.world;
    const cell = world.getCell(x, y);
    if (cell.id !== 'air' && cell.id !== 'water') {
      const before = waterLevel({ id: 'water', meta: { mass: cell.meta?.water || 0 } });
      cell.meta = { ...(cell.meta || {}) };
      if (mass < MIN_MASS) delete cell.meta.water; else cell.meta.water = mass;
      if (mass < MIN_MASS || waterLevel({ id: 'water', meta: { mass } }) !== before) world.touchCell(x, y);
      if (wake || mass < MIN_MASS) this.wakeAround(x, y);
      return;
    }
    if (mass < MIN_MASS) {
      if (cell.id === 'water') {
        world.setBlock(x, y, 'air', null);
        this.wakeAround(x, y);
      }
      return;
    }
    if (cell.id !== 'water') {
      world.setBlock(x, y, 'water', { mass, newAt: Date.now() });
      this.wakeAround(x, y);
      return;
    }
    const before = waterLevel(cell);
    cell.meta = { ...(cell.meta || {}), mass, still: false };
    delete cell.meta.level;
    if (waterLevel(cell) !== before) world.touchCell(x, y);
    if (wake) this.wakeAround(x, y);
  }
}
