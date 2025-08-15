export default {
  id: 'birch_leaves',
  displayName: 'Birch Leaves',
  shape: 'full',
  solid: false,
  color: '#a0d6b4',
  hardness: 0.2,
  isSolid(meta) {
    return meta?.placed === true;
  },
  tick(world, x, y, meta, time) {
    if (!meta) meta = {};
    if (!meta.decayDelay) meta.decayDelay = 0;
    meta.decayDelay++;
    
    if (meta.decayDelay < 20) return;
    meta.decayDelay = 0;
    
    if (meta?.placed) return;

    function hasNearbyLog(world, x, y, radius = 4) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (!world.inBounds(tx, ty)) continue;
          const blockId = world.getBlockId(tx, ty);
          if (blockId === 'oak_log' || blockId === 'birch_log' || blockId === 'spruce_log' || blockId === 'jungle_log') return true;
        }
      }
      return false;
    }

    if (hasNearbyLog(world, x, y, 4)) {
      meta.decay = 0;
      return;
    }
    meta.decay = (meta.decay || 0) + 0.1;
    if (meta.decay >= 10 + Math.random() * 10) {
      world.setBlock(x, y, 'air', null);
    }
  }
};
