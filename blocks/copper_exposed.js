export default {
  id: 'copper_exposed',
  displayName: 'Exposed Copper',
  shape: 'full',
  solid: true,
  color: '#a76750',
  hardness: 2,
  tick: function(world, x, y, meta, time) {
    // Continue oxidation: exposed -> weathered
    if (!meta) meta = {};
    if (meta.oxStart == null) meta.oxStart = time;
    const elapsed = time - meta.oxStart;

    const t2 = 180; // exposed -> weathered (world time units, affected by gameSpeed)
    if (world.getBlockId(x, y) !== 'copper_exposed') return;

    if (elapsed > t2) {
      world.setBlock(x, y, 'copper_weathered', null);
    }
  }
};
