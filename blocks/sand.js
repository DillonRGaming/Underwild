export default {
  id: 'sand',
  displayName: 'Sand',
  shape: 'full',
  solid: true,
  color: '#f4dc81',
  hardness: 1.5,
  isSolid() {
    return true;
  },
  tick(world, x, y, meta, time) {
    if (!meta) meta = {};
    if (meta._lastSandTime == null) meta._lastSandTime = time;
    const dt = time - meta._lastSandTime;
    meta._lastSandTime = time;
    meta._fallAccum = (meta._fallAccum || 0) + dt;

    const fallInterval = 0.25;
    if (meta._fallAccum < fallInterval) return;
    meta._fallAccum = 0;

    if (y < world.height - 1) {
      const below = world.getBlockId(x, y + 1);
      if (below === 'air' || below === 'water') {
        world.setBlock(x, y, 'air', null);
        world.setBlock(x, y + 1, 'sand', null);
        return;
      }
    }
  }
};
