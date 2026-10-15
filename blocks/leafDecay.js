const LOG_IDS = new Set(['oak_log', 'birch_log', 'spruce_log', 'maple_log', 'pine_log', 'birch_log_base']);

function isConnectedToLog(world, startX, startY, maxDistance = 8) {
  const visited = new Set();
  const queue = [{ x: startX, y: startY, dist: 0 }];
  for (let head = 0; head < queue.length; head++) {
    const { x, y, dist } = queue[head];
    const key = `${x},${y}`;
    if (visited.has(key) || dist > maxDistance) continue;
    visited.add(key);
    if (!world.inBounds(x, y)) continue;
    const blockId = world.getBlockId(x, y);
    if (LOG_IDS.has(blockId)) return true;
    if (!blockId.endsWith('_leaves')) continue;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (!visited.has(`${x + dx},${y + dy}`)) {
          queue.push({ x: x + dx, y: y + dy, dist: dist + 1 });
        }
      }
    }
  }
  return false;
}

export function createLeafDecayTick() {
  return function tick(world, x, y, meta) {
    if (meta.placed) return;
    meta.decayDelay = (meta.decayDelay || 0) + 1;
    if (meta.decayDelay < 40) return;
    meta.decayDelay = 0;

    if (isConnectedToLog(world, x, y)) {
      meta.decay = 0;
      return;
    }

    meta.decay = (meta.decay || 0) + 0.3;
    if (meta.decay >= 3 + Math.random() * 2) {
      world.setBlock(x, y, 'air', null);
    }
  };
}
