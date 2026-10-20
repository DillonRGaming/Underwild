import { gameClock } from '../../src/core/gameClock.js';
// Furnace: four crucibles smelt side by side over one fire. While fuel burns, every
// crucible with something smeltable cooks it into its output slot.
//
// meta.inv: 0-3 crucibles (input), 4-7 their outputs, 8 fuel.
// meta.burnId (fuel now burning), meta.burn / burnMax (seconds of fuel), meta.cook[4] (seconds cooked).

// input id -> [output id, seconds to cook]
// What each thing smelts into lives on the thing itself: smelt: { into: 'copper_ingot', time: 3 }
// (seconds), plus optionally fuel: ['coal', 'coal_block'] if only those fires will cook it.
// And fuel says how long it burns: burnTime: 40.
let registry = null;
export function useFurnaceRegistry(r) {
  registry = r;
}
export function smeltingOf(id) {
  const s = id && registry?.get(id)?.smelt;
  return s ? [s.into, s.time, s.fuel] : null;
}

export const CRUCIBLES = 4;
export const OUT = 4;
export const FUEL = 8;
export const FURNACE_SLOTS = 9;

// Seconds of burning a fuel gives (its burnTime; 0 = doesn't burn).
export function fuelTime(id) {
  return (id && registry?.get(id)?.burnTime) || 0;
}

const stackIdOf = (s) => (s ? s.blockId || s.itemId : null);

function makeStack(registry, id, count) {
  const def = registry.get(id);
  const isItem = registry.isItem(id);
  return {
    type: isItem ? 'item' : 'block',
    [isItem ? 'itemId' : 'blockId']: id,
    displayName: def?.displayName || id,
    count,
    maxStack: def?.maxStack ?? 24,
    // Heated metal starts cooling as soon as it comes out (see coolStack in script.js).
    ...(def?.heated ? { heatedAt: gameClock.now() } : {})
  };
}

export function ensureFurnaceMeta(meta) {
  const old = Array.isArray(meta.inv) ? meta.inv : [];
  if (old.length < FURNACE_SLOTS) {
    // Older furnaces had [input, fuel, output].
    const inv = Array.from({ length: FURNACE_SLOTS }, () => null);
    if (old.length === 3) {
      inv[0] = old[0];
      inv[FUEL] = old[1];
      inv[OUT] = old[2];
    } else {
      old.forEach((s, i) => {
        if (i < FURNACE_SLOTS) inv[i] = s;
      });
    }
    meta.inv = inv;
  }
  meta.burn ??= 0;
  meta.burnMax ??= 0;
  if (!Array.isArray(meta.cook)) meta.cook = [0, 0, 0, 0];
  delete meta.temp;
  delete meta.over;
  return meta;
}

// Recipe for crucible i, or null.
export function crucibleRecipe(meta, i) {
  return smeltingOf(stackIdOf(meta.inv[i]));
}

// Whether recipe r cooks on this fuel (a recipe without a fuel list takes any).
const fuelSuits = (r, fuelId) => !r[2] || r[2].includes(fuelId);

// 'empty' | 'idle' (no fire, or the wrong fuel) | 'cooking' | 'full' (output blocked)
export function crucibleState(meta, i, registry) {
  const r = crucibleRecipe(meta, i);
  if (!r) return 'empty';
  const out = meta.inv[OUT + i];
  if (out && (stackIdOf(out) !== r[0] || out.count >= (out.maxStack ?? registry?.get(r[0])?.maxStack ?? 24))) return 'full';
  return meta.burn > 0 && fuelSuits(r, meta.burnId) ? 'cooking' : 'idle';
}

// Advance the furnace by dt seconds. Returns true if anything changed.
export function stepFurnace(meta, dt, registry) {
  ensureFurnaceMeta(meta);
  const inv = meta.inv;
  let changed = false;
  // Light the next piece of fuel only when something can actually cook.
  const canCook = () =>
    [0, 1, 2, 3].some((i) => {
      const r = crucibleRecipe(meta, i);
      return r && fuelSuits(r, stackIdOf(inv[FUEL])) && crucibleState(meta, i, registry) !== 'full';
    });
  if (meta.burn <= 0 && fuelTime(stackIdOf(inv[FUEL])) > 0 && canCook()) {
    meta.burnMax = meta.burn = fuelTime(stackIdOf(inv[FUEL]));
    meta.burnId = stackIdOf(inv[FUEL]);
    inv[FUEL].count -= 1;
    if (inv[FUEL].count <= 0) inv[FUEL] = null;
    changed = true;
  }
  const burning = meta.burn > 0;
  if (burning) {
    // Every crucible cooking draws on the same fire, so fuel burns that many times faster.
    const cooking = [0, 1, 2, 3].filter((i) => crucibleState(meta, i, registry) === 'cooking').length;
    meta.burn = Math.max(0, meta.burn - dt * Math.max(1, cooking));
    changed = true;
  }
  for (let i = 0; i < CRUCIBLES; i++) {
    const r = crucibleRecipe(meta, i);
    if (!r) {
      if (meta.cook[i]) {
        meta.cook[i] = 0;
        changed = true;
      }
      continue;
    }
    const state = crucibleState(meta, i, registry);
    if (state === 'cooking') {
      meta.cook[i] += dt;
      changed = true;
      if (meta.cook[i] >= r[1]) {
        meta.cook[i] = 0;
        inv[i].count -= 1;
        if (inv[i].count <= 0) inv[i] = null;
        if (inv[OUT + i]) inv[OUT + i].count += 1;
        else inv[OUT + i] = makeStack(registry, r[0], 1);
      }
    } else if (state !== 'full' && meta.cook[i] > 0) {
      // Fire's out: progress slowly slips back.
      meta.cook[i] = Math.max(0, meta.cook[i] - dt * 0.5);
      changed = true;
    }
  }
  return changed;
}

export default {
  id: 'furnace',
  displayName: 'Furnace',
  material: 'stone',
  kind: 'station',
  tab: 'functional',
  dropsContents: true, // spills what's inside when broken
  recipes: [
    // how it's crafted
    { shape: ['scs', 'c c', 'sss'], ingredients: { s: 'stone', c: 'clay' }, count: 1 }
  ],
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  color: '#808080',
  hardness: 3,
  lightLevel: 10,
  // Runs on the world's slow tick; game time since the last run keeps it accurate.
  tick(world, x, y, meta) {
    const now = gameClock.now();
    const dt = meta.lastTick ? Math.max(0, Math.min(5, (now - meta.lastTick) / 1000)) : 0;
    meta.lastTick = now;
    if (dt > 0 && Array.isArray(meta.inv) && stepFurnace(meta, dt, world.registry)) world.touchCell(x, y);
  }
};
