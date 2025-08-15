export default {
  id: 'short_grass',
  displayName: 'Short Grass',
  shape: 'full',
  solid: false,
  color: '#7cb342',
  hardness: 0.1,
  onBreak(world, x, y, meta) {
    // Check if there's a block above that should also break
    if (world.inBounds(x, y - 1)) {
      const aboveId = world.getBlockId(x, y - 1);
      if (aboveId === 'poppy' || aboveId === 'short_grass') {
        world.setBlock(x, y - 1, 'air', null);
      }
    }
  }
};
