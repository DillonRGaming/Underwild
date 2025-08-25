export default {
  id: 'gravel',
  displayName: 'Gravel',
  shape: 'full',
  solid: true,
  color: '#a9a9a9',
  hardness: 2.0,
  isSolid() {
    return true;
  },
  tick(world, x, y, meta, time) {
    if (!meta) meta = {};
    if (!meta.fallDelay) meta.fallDelay = 0;
    meta.fallDelay++;
    
    if (meta.fallDelay < 10) return;
    meta.fallDelay = 0;
    
    if (y < world.height - 1) {
      const below = world.getBlockId(x, y + 1);
      if (below === 'air' || below === 'water') {
        world.setBlock(x, y, 'air');
        world.setBlock(x, y + 1, 'gravel');
        return;
      }
    }
  }
};
