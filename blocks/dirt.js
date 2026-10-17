// Open air above, below, left or right of (x, y): somewhere grass can grow.
export function hasOpenSide(world, x, y) {
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    if (!world.inBounds(x + dx, y + dy)) continue;
    const t = world.getBlockType(x + dx, y + dy);
    if (!t || !t.solid || (t.shape && t.shape !== 'full')) return true;
  }
  return false;
}

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
            // Grass climbs onto dirt with open air above it or beside it.
            if (hasOpenSide(world, x, y) && Math.random() < 0.1) {
              world.setBlock(x, y, 'grass', null);
              world.updateLighting(x, y);
              return;
            }
          }
        }
      }
    }
  }
};
