export default {
  id: 'poppy',
  displayName: 'Poppy',
  shape: 'full',
  solid: false,
  color: '#ff6b6b',
  hardness: 0.1,
  onBreak(world, x, y, meta) {
    if (world.inBounds(x, y - 1)) {
      const aboveId = world.getBlockId(x, y - 1);
      if (['poppy', 'short_grass', 'fern', 'flower_short_grass', 'bush', 'grass_tuft', 'rock', 'pebble', 'seagrass', 'shell'].includes(aboveId)) {
        world.setBlock(x, y - 1, 'air', null);
      }
    }
    
    if (world.inBounds(x, y + 1)) {
      const belowId = world.getBlockId(x, y + 1);
      if (belowId !== 'grass' && belowId !== 'dirt' && belowId !== 'coarse_dirt' && belowId !== 'mud' && belowId !== 'sand') {
        world.setBlock(x, y, 'air', null);
      }
    }
  },
  tick(world, x, y, meta, time) {
    const belowX = x;
    const belowY = y + 1;
    if (world.inBounds(belowX, belowY)) {
      const belowId = world.getBlockId(belowX, belowY);
      if (belowId !== 'grass' && belowId !== 'dirt' && belowId !== 'coarse_dirt' && belowId !== 'mud' && belowId !== 'sand') {
        world.setBlock(x, y, 'air', null);
        world.updateLighting(x, y);
      }
    }
  }
};
