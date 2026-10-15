export default {
  id: 'dirt',
  displayName: 'Dirt',
  shape: 'full',
  solid: true,
  color: '#7a4b27',
  hardness: 2.0,
  tick(world, x, y, meta, time) {
    const neighbors = [
      {x: x + 1, y},
      {x: x - 1, y},
      {x: x, y: y + 1},
      {x: x, y: y - 1},
      {x: x + 1, y: y + 1},
      {x: x + 1, y: y - 1},
      {x: x - 1, y: y + 1},
      {x: x - 1, y: y - 1}
    ];
    
    if (Math.random() < 0.05) {
      for (const n of neighbors) {
        if (world.inBounds(n.x, n.y)) {
          const neighborId = world.getBlockId(n.x, n.y);
          if (neighborId === 'grass') {
            const aboveX = x;
            const aboveY = y - 1;
            if (world.inBounds(aboveX, aboveY)) {
              const aboveType = world.getBlockType(aboveX, aboveY);
              if (!aboveType || !aboveType.solid) {
                if (Math.random() < 0.1) {
                  world.setBlock(x, y, 'grass', null);
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
