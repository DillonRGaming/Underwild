export default {
  id: 'spruce_leaves',
  displayName: 'Spruce Leaves',
  shape: 'full',
  solid: false,
  color: '#44aa44',
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

    // Only check for nearby logs 25% of the time to reduce CPU usage
    if (Math.random() < 0.75) return;

    function hasNearbyLog(world, x, y, radius = 3) { // Reduced radius from 4 to 3
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (!world.inBounds(tx, ty)) continue;
          const blockId = world.getBlockId(tx, ty);
          // Check for common log types first for better performance
          if (blockId === 'oak_log' || blockId === 'birch_log' || blockId === 'spruce_log') return true;
          // Check for less common log types
          if (blockId === 'jungle_log' || blockId === 'maple_log') return true;
        }
      }
      return false;
    }

    if (hasNearbyLog(world, x, y, 3)) { // Reduced radius
      meta.decay = 0;
      return;
    }
    
    meta.decay = (meta.decay || 0) + 0.5;
    // Scale decay speed with gameSpeed
    if (meta.decay >= (2 + Math.random() * 3) / (typeof gameSpeed !== 'undefined' ? gameSpeed : 1)) {
      // Instead of just removing the block, create a falling leaf entity
      // Add the falling leaf to the items array (which handles all falling/physics entities)
      if (typeof items !== 'undefined' && typeof TILE_SIZE !== 'undefined') {
        const leafX = (x + 0.5) * TILE_SIZE;
        const leafY = (y + 0.5) * TILE_SIZE;
        const fallingLeaf = new FallingLeafEntity('spruce_leaves', leafX, leafY, world.time);
        items.push(fallingLeaf);
      }
      world.setBlock(x, y, 'air', null);
      // Update lighting around the removed block
      world.updateLighting(x, y);
    }
  }
};
