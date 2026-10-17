import { gameClock } from '../../src/core/gameClock.js';

// Max leaves searched per check; bigger than any tree, so this only cuts off huge
// player-built leaf masses (which then count as connected rather than decaying).
const MAX_SEARCH = 600;

// True if any log touches this leaf's tree: walks through all connected leaves
// (including placed ones), not just the nearby ones.
function isConnectedToLog(world, startX, startY) {
  const visited = new Set();
  const queue = [startX, startY];
  for (let head = 0; head < queue.length; head += 2) {
    const x = queue[head], y = queue[head + 1];
    const key = x * 65536 + y;
    if (visited.has(key)) continue;
    visited.add(key);
    if (visited.size > MAX_SEARCH) return true;
    if (!world.inBounds(x, y)) continue;
    const def = world.getBlockType(x, y);
    if (def?.trunk) return true;
    if (!def?.leaves) continue;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx !== 0 || dy !== 0) queue.push(x + dx, y + dy);
      }
    }
  }
  return false;
}

// Natural leaves with no log anywhere in their tree fall away one at a time: each picks
// its own random moment (the leaf block's leaves.decay [min, max] seconds) so the crown
// thins gradually. Leaves with decay: null never fall.
const CHECK_EVERY = 8;       // block ticks between connection checks

export function createLeafDecayTick() {
  return function tick(world, x, y, meta) {
    const decay = this.leaves?.decay;
    if (meta.placed || !decay) return;
    const [DECAY_MIN, DECAY_MAX] = decay;
    const now = gameClock.seconds();
    // Timestamps from before the game clock existed are far in the future; restart them.
    if (meta.decayAt != null && meta.decayAt > now + DECAY_MAX) meta.decayAt = null;
    if (meta.decayAt != null) {
      if (now < meta.decayAt) return;
      if (isConnectedToLog(world, x, y)) {
        meta.decayAt = null;
        return;
      }
      const leafId = world.getBlockId(x, y);
      world.setBlock(x, y, 'air', null);
      world.onLeafDecayed?.(leafId, x, y);
      return;
    }
    meta.decayDelay = (meta.decayDelay || 0) + 1;
    if (meta.decayDelay < CHECK_EVERY) return;
    meta.decayDelay = 0;
    if (!isConnectedToLog(world, x, y)) {
      meta.decayAt = now + DECAY_MIN + Math.random() * (DECAY_MAX - DECAY_MIN);
    }
  };
}
