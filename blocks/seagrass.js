// Grows on lakebeds; dies if the sand under it goes.
const GROUND = new Set(['sand', 'wet_sand', 'dirt', 'mud', 'clay', 'gravel']);
export default {
  id: 'seagrass',
  displayName: 'Seagrass',
  shape: 'full',
  solid: false,
  color: '#2e8042',
  hardness: 0.1,
  tick(world, x, y) {
    if (world.inBounds(x, y + 1) && !GROUND.has(world.getBlockId(x, y + 1))) {
      world.setBlock(x, y, 'air', null);
      world.updateLighting(x, y);
    }
  }
};
