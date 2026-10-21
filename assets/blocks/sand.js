import { gameClock } from '../../src/core/gameClock.js';
// Loose blocks (sand, gravel) fall when there's air or water underneath. They start slowly
// and pick up speed, sink slowly through water, and swap places with the water they enter.
const FALL_WAIT_START = 5; // pace of the first drops; it speeds up from there
const FALL_WAIT_MIN = 2; // fastest pace in air: one block every 2 ticks
const FALL_WAIT_WATER = 5; // sinking through water
export const FALL_TICK_MS = 60; // matches world.js FALL_TICK_INTERVAL

// Once a fallen block has finished sliding into place it's an ordinary block again (gets its
// outlines, rounded corners and seams back, and stops being redrawn every frame).
function settle(world, x, y, meta) {
  if (!meta.fellAt || gameClock.now() - meta.fellAt < (meta.slideMs || FALL_TICK_MS * FALL_WAIT_START)) return;
  delete meta.fellAt;
  delete meta.slideMs;
  delete meta.fallStreak;
  delete meta.fallWait;
  world.noteRedraw(x, y);
}

export function fallTick(world, x, y, id, meta) {
  if (y >= world.height - 1) return;
  const isBg = meta?.layer === 'bg';
  const belowCell = world.getCell(x, y + 1);
  const below = belowCell.id;
  const belowSolid = world.isSolidAt(x, y + 1);

  if (isBg) {
    const belowHasBg = belowCell.meta?.layer === 'bg' || !!belowCell.meta?.bgId;
    if (belowSolid || belowHasBg) {
      if (meta.fallStreak || meta.fallWait) {
        meta.fallStreak = 0;
        meta.fallWait = 0;
      }
      settle(world, x, y, meta);
      return;
    }
    const streak = meta.fallStreak || 0;
    const waitFor = (n) => (below === 'water' ? FALL_WAIT_WATER : Math.max(FALL_WAIT_MIN, FALL_WAIT_START - n));
    const need = streak === 0 ? 1 : waitFor(streak);
    meta.fallWait = (meta.fallWait || 0) + 1;
    if (meta.fallWait < need) return;

    let top = y;
    while (top > 0 && world.getCell(x, top - 1).meta?.layer === 'bg' && world.getBlockType(x, top - 1)?.falls) top--;
    const gMult = world.gravityMultiplier ?? world.dimension?.gravityMultiplier ?? 1;
    const tickMs = Math.round(FALL_TICK_MS / Math.max(0.01, gMult));
    const fell = { fellAt: gameClock.now(), slideMs: waitFor(streak + 1) * tickMs, fallStreak: streak + 1, fallWait: 0, layer: 'bg' };

    for (let ty = y; ty >= top; ty--) {
      const tid = ty === y ? id : world.getBlockId(x, ty);
      const targetCell = world.getCell(x, ty + 1);
      if (targetCell.id === 'air' || ty < y) {
        const waterMass = targetCell.meta?.water;
        const newMeta = waterMass ? { ...fell, water: waterMass } : { ...fell };
        world.setBlock(x, ty + 1, tid, newMeta);
      } else {
        world.setBlock(x, ty + 1, targetCell.id, { ...(targetCell.meta || {}), bgId: tid, ...fell });
      }
    }
    const topCell = world.getCell(x, top);
    if (topCell.meta?.bgId) {
      const cleanMeta = { ...topCell.meta };
      delete cleanMeta.bgId;
      world.setBlock(x, top, topCell.id, cleanMeta);
    } else {
      const topWater = topCell.meta?.water;
      world.setBlock(x, top, topWater ? 'water' : 'air', topWater ? { mass: topWater } : null);
    }
    return;
  }

  if (belowSolid) {
    if (meta.fallStreak || meta.fallWait) {
      meta.fallStreak = 0;
      meta.fallWait = 0;
    }
    settle(world, x, y, meta);
    return;
  }
  const streak = meta.fallStreak || 0;
  const waitFor = (n) => (below === 'water' ? FALL_WAIT_WATER : Math.max(FALL_WAIT_MIN, FALL_WAIT_START - n));
  // Starts falling on the first tick, then each drop waits for the previous slide to finish.
  const need = streak === 0 ? 1 : waitFor(streak);
  meta.fallWait = (meta.fallWait || 0) + 1;
  if (meta.fallWait < need) return;
  // The whole stack of loose blocks resting on this one drops with it.
  let top = y;
  while (top > 0 && world.getCell(x, top - 1).meta?.layer !== 'bg' && world.getBlockType(x, top - 1)?.falls) top--;
  const gMult = world.gravityMultiplier ?? world.dimension?.gravityMultiplier ?? 1;
  const tickMs = Math.round(FALL_TICK_MS / Math.max(0.01, gMult));
  const fell = { fellAt: gameClock.now(), slideMs: waitFor(streak + 1) * tickMs, fallStreak: streak + 1, fallWait: 0 };
  const waterMeta = below === 'water' ? { ...(belowCell.meta || {}) } : null;
  for (let ty = y; ty >= top; ty--) {
    const tid = ty === y ? id : world.getBlockId(x, ty);
    world.setBlock(x, ty + 1, tid, { ...fell });
  }
  world.setBlock(x, top, waterMeta ? 'water' : 'air', waterMeta);
}

export function createFallingSand(id, displayName, color) {
  return {
    id,
    displayName,
    material: id.startsWith('red_') ? 'red_sand' : 'sand',
    kind: 'block',
    tab: 'nature',
    tool: 'shovel',
    // Plain sand takes land plants and beach/lakebed ones; the other sands only the latter.
    soil: id === 'sand' ? ['land', 'beach', 'lakebed'] : id === 'wet_sand' ? ['beach', 'lakebed'] : [],
    shape: 'full',
    solid: true,
    color,
    hardness: 1.5,
    falls: true,
    isSolid(meta) {
      return meta?.layer !== 'bg';
    },
    tick(world, x, y, meta) {
      fallTick(world, x, y, id, meta);
    }
  };
}

export default {
  ...createFallingSand('sand', 'Sand', '#f4dc81'),
  smelt: { into: 'glass', time: 4 },
  recipes: [
    { shapeless: { rippled_sand: 1 }, count: 1 },
    { shapeless: { cracked_sand: 1 }, count: 1 }
  ]
};
