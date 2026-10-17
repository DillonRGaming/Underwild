// A small beach shell; meta.v (1-3) picks the look.
const GROUND = new Set(['sand', 'wet_sand', 'dirt', 'mud', 'clay', 'gravel', 'grass', 'coarse_dirt']);
export default {
  id: 'shell',
  displayName: 'Shell',
  shape: 'full',
  solid: false,
  color: '#ecd6be',
  hardness: 0.1,
  tick(world, x, y) {
    if (world.inBounds(x, y + 1) && !GROUND.has(world.getBlockId(x, y + 1))) {
      world.setBlock(x, y, 'air', null);
      world.updateLighting(x, y);
    }
  }
};
