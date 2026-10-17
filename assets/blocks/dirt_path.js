// Packed dirt where animals keep walking; generates as short trails in wooded biomes.
export default {
  id: 'dirt_path',
  displayName: 'Dirt Path',
  material: 'dirt',
  kind: 'block',
  tab: 'nature',
  tool: 'shovel', // mined fastest with this
  shape: 'full',
  solid: true,
  color: '#8c6a44',
  hardness: 2.0,
  // Its top sits one texel below a normal block (see physics topSurfaceY).
  surfaceInset: 1,
  drop: 'dirt',
  // Like grass, a path under a solid block gets packed back into plain dirt.
  tick(world, x, y) {
    if (!world.inBounds(x, y - 1)) return;
    const above = world.getBlockType(x, y - 1);
    if (above && above.solid && Math.random() < 0.1) {
      world.setBlock(x, y, 'dirt', null);
      world.updateLighting(x, y);
    }
  }
};
