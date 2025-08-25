export default {
  id: 'copper_exposed',
  displayName: 'Exposed Copper',
  shape: 'full',
  solid: true,
  color: '#a76750',
  hardness: 2,
  tick: function(world, x, y, meta, time) {
    if (!meta) meta = {};
    if (meta.oxStart == null) meta.oxStart = time;
    const elapsed = time - meta.oxStart;

    const t2 = 180;
    if (world.getBlockId(x, y) !== 'copper_exposed') return;

    if (elapsed > t2) {
      world.setBlock(x, y, 'copper_weathered', null);
    }
  }
};
