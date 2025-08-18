export default {
  id: 'dirt',
  displayName: 'Dirt',
  shape: 'full',
  solid: true,
  color: '#7a4b27',
  hardness: 0.5,
  tick(world, x, y, meta, time) {
    // Check adjacent blocks for grass spreading (including diagonals)
    const neighbors = [
      {x: x + 1, y},
      {x: x - 1, y},
      {x: x, y: y + 1},
      {x: x, y: y - 1},
      {x: x + 1, y: y + 1}, // diagonal
      {x: x + 1, y: y - 1}, // diagonal
      {x: x - 1, y: y + 1}, // diagonal
      {x: x - 1, y: y - 1}  // diagonal
    ];
    
    // Randomly check neighbors for grass spreading
    if (Math.random() < 0.05) { // 5% chance per tick to check for spreading
      for (const n of neighbors) {
        if (world.inBounds(n.x, n.y)) {
          const neighborId = world.getBlockId(n.x, n.y);
          // If neighbor is grass, this dirt block can potentially turn to grass
          if (neighborId === 'grass') {
            // Check if there's no solid block above (grass needs light)
            const aboveX = x;
            const aboveY = y - 1;
            if (world.inBounds(aboveX, aboveY)) {
              const aboveType = world.getBlockType(aboveX, aboveY);
              if (!aboveType || !aboveType.solid) {
                // 10% chance to spread grass
                if (Math.random() < 0.1) {
                  world.setBlock(x, y, 'grass', null);
                  // Update lighting around the changed block
                  world.updateLighting(x, y);
                  return;
                }
              }
            }
          }
        }
      }
    }
  }
};
