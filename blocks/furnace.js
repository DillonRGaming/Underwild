// Furnace: smelts raw ore into ingots and heats ingots for forging. Its state lives in its
// meta: inv = [input, fuel, output], burn/burnMax (seconds of fuel left / of the current
// fuel item) and cook (seconds the current input has been cooking). It runs whether or
// not its window is open.

// input id -> [output id, seconds to cook]
export const SMELTING = {
  raw_copper: ['copper_ingot', 6],
  raw_gold: ['gold_ingot', 6],
  raw_steel: ['steel_ingot', 8],
  copper_ingot: ['copper_ingot_heated', 4],
  gold_ingot: ['gold_ingot_heated', 4],
  steel_ingot: ['steel_ingot_heated', 5],
  sand: ['glass', 5]
};

// Seconds of burning each fuel gives.
export function fuelTime(id) {
  if (!id) return 0;
  if (id === 'coal') return 40;
  if (id === 'coal_block') return 400;
  if (id.endsWith('_log') || id.endsWith('_log_base')) return 15;
  if (id.endsWith('_planks') || id === 'crafting_table') return 7.5;
  if (id === 'stick') return 2.5;
  return 0;
}

export const FURNACE_SLOTS = 3;

const stackIdOf = s => (s ? s.blockId || s.itemId : null);

function makeStack(registry, id, count) {
  const def = registry.get(id);
  const isItem = registry.isItem(id);
  return {
    type: isItem ? 'item' : 'block',
    [isItem ? 'itemId' : 'blockId']: id,
    displayName: def?.displayName || id,
    count,
    maxStack: def?.maxStack ?? 64,
    // Heated metal starts cooling as soon as it comes out (see coolStack in script.js).
    ...(def?.heated ? { heatedAt: Date.now() } : {})
  };
}

export function ensureFurnaceMeta(meta) {
  if (!Array.isArray(meta.inv) || meta.inv.length < FURNACE_SLOTS) {
    const inv = Array.from({ length: FURNACE_SLOTS }, () => null);
    (meta.inv || []).forEach((s, i) => { if (i < FURNACE_SLOTS) inv[i] = s; });
    meta.inv = inv;
  }
  meta.burn ??= 0;
  meta.burnMax ??= 0;
  meta.cook ??= 0;
  return meta;
}

// Can the input be smelted into the output slot right now?
function canSmelt(registry, inv) {
  const recipe = SMELTING[stackIdOf(inv[0])];
  if (!recipe || !registry.get(recipe[0])) return null;
  const out = inv[2];
  if (!out) return recipe;
  if (stackIdOf(out) !== recipe[0] || out.count >= (out.maxStack ?? 64)) return null;
  return recipe;
}

// Advance the furnace by dt seconds. Returns true if anything changed.
export function stepFurnace(meta, dt, registry) {
  ensureFurnaceMeta(meta);
  const inv = meta.inv;
  let changed = false;
  let recipe = canSmelt(registry, inv);
  // Light a new piece of fuel when there's something to smelt.
  if (meta.burn <= 0 && recipe && fuelTime(stackIdOf(inv[1])) > 0) {
    meta.burnMax = meta.burn = fuelTime(stackIdOf(inv[1]));
    inv[1].count -= 1;
    if (inv[1].count <= 0) inv[1] = null;
    changed = true;
  }
  if (meta.burn > 0) {
    meta.burn = Math.max(0, meta.burn - dt);
    changed = true;
    if (recipe) {
      meta.cook += dt;
      if (meta.cook >= recipe[1]) {
        meta.cook = 0;
        inv[0].count -= 1;
        if (inv[0].count <= 0) inv[0] = null;
        if (inv[2]) inv[2].count += 1;
        else inv[2] = makeStack(registry, recipe[0], 1);
      }
    } else if (meta.cook > 0) {
      meta.cook = 0;
    }
  } else if (meta.cook > 0) {
    // Out of fuel: the half-cooked item slowly cools back down.
    meta.cook = Math.max(0, meta.cook - dt * 2);
    changed = true;
  }
  return changed;
}

export default {
  id: 'furnace',
  displayName: 'Furnace',
  shape: 'full',
  solid: true,
  color: '#808080',
  hardness: 3,
  lightLevel: 10,
  // Runs on the world's slow tick; real time since the last run keeps it accurate.
  tick(world, x, y, meta) {
    const now = Date.now();
    const dt = meta.lastTick ? Math.min(5, (now - meta.lastTick) / 1000) : 0;
    meta.lastTick = now;
    if (dt > 0 && Array.isArray(meta.inv) && stepFurnace(meta, dt, world.registry)) world.touchCell(x, y);
  }
};
