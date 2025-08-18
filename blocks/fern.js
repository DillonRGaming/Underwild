export default {
  id: 'fern',
  displayName: 'Fern',
  shape: 'full',
  solid: false,
  color: '#5d8e4d',
  hardness: 0.1,
  onBreak(world, x, y, meta) {
    // Check if there's a block above that should also break
    if (world.inBounds(x, y - 1)) {
      const aboveId = world.getBlockId(x, y - 1);
      if (aboveId === 'poppy' || aboveId === 'short_grass' || aboveId === 'fern') {
        world.setBlock(x, y - 1, 'air', null);
      }
    }
    
    // Check if the block underneath is broken, and if so, break this block too
    if (world.inBounds(x, y + 1)) {
      const belowId = world.getBlockId(x, y + 1);
      if (belowId !== 'grass' && belowId !== 'dirt' && belowId !== 'coarse_dirt' && belowId !== 'mud' && belowId !== 'sand') {
        world.setBlock(x, y, 'air', null);
      }
    }
  },
  tick(world, x, y, meta, time) {
    // Check if there's no grass block below the fern
    const belowX = x;
    const belowY = y + 1;
    if (world.inBounds(belowX, belowY)) {
      const belowId = world.getBlockId(belowX, belowY);
      // If there's no grass block below, remove the fern
      if (belowId !== 'grass' && belowId !== 'dirt' && belowId !== 'coarse_dirt' && belowId !== 'mud' && belowId !== 'sand') {
        world.setBlock(x, y, 'air', null);
        // Update lighting around the changed block
        world.updateLighting(x, y);
      }
    }
  }
};
