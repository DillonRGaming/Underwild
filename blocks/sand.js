// Loose blocks (sand, gravel) fall when there's air or water underneath. They start slowly
// and pick up speed, sink slowly through water, and swap places with the water they enter.
const FALL_WAIT_START = 5;   // pace of the first drops; it speeds up from there
const FALL_WAIT_MIN = 2;     // fastest pace in air: one block every 2 ticks
const FALL_WAIT_WATER = 5;   // sinking through water
export const FALL_TICK_MS = 60; // matches world.js FALL_TICK_INTERVAL

export function fallTick(world, x, y, id, meta) {
  if (y >= world.height - 1) return;
  const belowCell = world.getCell(x, y + 1);
  const below = belowCell.id;
  if (below !== 'air' && below !== 'water') {
    if (meta.fallStreak || meta.fallWait) { meta.fallStreak = 0; meta.fallWait = 0; }
    return;
  }
  const streak = meta.fallStreak || 0;
  const waitFor = n => below === 'water' ? FALL_WAIT_WATER : Math.max(FALL_WAIT_MIN, FALL_WAIT_START - n);
  // Starts falling on the first tick, then each drop waits for the previous slide to finish.
  const need = streak === 0 ? 1 : waitFor(streak);
  meta.fallWait = (meta.fallWait || 0) + 1;
  if (meta.fallWait < need) return;
  // The whole stack of loose blocks resting on this one drops with it.
  let top = y;
  while (top > 0 && world.getBlockType(x, top - 1)?.falls) top--;
  const fell = { fellAt: performance.now(), slideMs: waitFor(streak + 1) * FALL_TICK_MS, fallStreak: streak + 1, fallWait: 0 };
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
    shape: 'full',
    solid: true,
    color,
    hardness: 1.5,
    falls: true,
    isSolid() {
      return true;
    },
    tick(world, x, y, meta) {
      fallTick(world, x, y, id, meta);
    }
  };
}

export default createFallingSand('sand', 'Sand', '#f4dc81');
