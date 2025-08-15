export default {
  id: 'sand',
  displayName: 'Sand',
  shape: 'full',
  solid: true,
  color: '#f4dc81',
  hardness: 0.5,
  isSolid() {
    return true;
  },
  tick(world, x, y, meta, time) {
    // Time-driven sand behavior — respects world.time so /tick affects it.
    if (!meta) meta = {};
    // Track last processed world time for this sand tile
    if (meta._lastSandTime == null) meta._lastSandTime = time;
    const dt = time - meta._lastSandTime;
    meta._lastSandTime = time;
    meta._fallAccum = (meta._fallAccum || 0) + dt;

    // Attempt to fall every 0.25s of world time
    const fallInterval = 0.25;
    if (meta._fallAccum < fallInterval) return;
    meta._fallAccum = 0;

    if (y < world.height - 1) {
      const below = world.getBlockId(x, y + 1);
      if (below === 'air' || below === 'water') {
        // Move sand down one tile; don't carry meta to the new tile
        world.setBlock(x, y, 'air', null);
        world.setBlock(x, y + 1, 'sand', null);
        return;
      }
    }
  }
};
