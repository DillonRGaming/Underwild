// Shared leaf decay logic that only decays leaves when ALL logs from a tree are removed
// This uses a flood-fill algorithm to check if leaves are connected to any log via other leaves

export function createLeafDecayTick(leafType) {
  return function tick(world, x, y, meta, time) {
    if (!meta) meta = {};
    if (!meta.decayDelay) meta.decayDelay = 0;
    meta.decayDelay++;
    
    if (meta.decayDelay < 40) return; // Slower decay check
    meta.decayDelay = 0;
    
    // Never decay player-placed leaves
    if (meta?.placed) return;

    // Enhanced tree connection check using flood-fill
    function isConnectedToLog(startX, startY, maxDistance = 8) {
      const visited = new Set();
      const queue = [{x: startX, y: startY, dist: 0}];
      
      while (queue.length > 0) {
        const {x: cx, y: cy, dist} = queue.shift();
        const key = `${cx},${cy}`;
        
        if (visited.has(key) || dist > maxDistance) continue;
        visited.add(key);
        
        if (!world.inBounds(cx, cy)) continue;
        const blockId = world.getBlockId(cx, cy);
        
        // Found a log - leaves are connected!
        if (blockId === 'oak_log' || blockId === 'birch_log' || blockId === 'spruce_log' || 
            blockId === 'maple_log' || blockId === 'jungle_log') {
          return true;
        }
        
        // Only continue through leaves of the same type or any log
        if (blockId === leafType || blockId.endsWith('_leaves')) {
          // Add adjacent blocks to queue
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              const ny = cy + dy;
              const nkey = `${nx},${ny}`;
              if (!visited.has(nkey)) {
                queue.push({x: nx, y: ny, dist: dist + 1});
              }
            }
          }
        }
      }
      
      return false; // No log connection found
    }

    // Check if this leaf is connected to any log
    if (isConnectedToLog(x, y)) {
      meta.decay = 0;
      return;
    }
    
    // Not connected to any log - start decaying
    meta.decay = (meta.decay || 0) + 0.3;
    const decayThreshold = 3 + Math.random() * 2;
    
    if (meta.decay >= decayThreshold / (typeof gameSpeed !== 'undefined' ? gameSpeed : 1)) {
      // Create falling leaf particle if entities are available
      if (typeof items !== 'undefined' && typeof TILE_SIZE !== 'undefined') {
        const leafX = (x + 0.5) * TILE_SIZE;
        const leafY = (y + 0.5) * TILE_SIZE;
        
        // Try to create falling leaf entity
        try {
          if (typeof FallingLeafEntity !== 'undefined') {
            const fallingLeaf = new FallingLeafEntity(leafType, leafX, leafY, world.time);
            items.push(fallingLeaf);
          }
        } catch (e) {
          // Fallback if FallingLeafEntity doesn't exist
          console.warn('FallingLeafEntity not available:', e);
        }
      }
      
      world.setBlock(x, y, 'air', null);
      world.updateLighting(x, y);
    }
  };
}
