export default {
  id: 'copper_weathered',
  displayName: 'Weathered Copper',
  shape: 'full',
  solid: true,
  color: '#4f997e',
  hardness: 2,
  tick: function(world, x, y, meta, time) {
    if (!meta) meta = {};
    if (meta.oxStart == null) meta.oxStart = time;
    const elapsed = time - meta.oxStart;

    const t3 = 420;
    if (world.getBlockId(x, y) !== 'copper_weathered') return;

    if (elapsed > t3) {
      world.setBlock(x, y, 'copper_oxidized', null);
    }
  }
};
