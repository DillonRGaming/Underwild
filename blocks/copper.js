export default {
  id: 'copper',
  displayName: 'Copper',
  shape: 'full',
  solid: true,
  color: '#c1703a',
  hardness: 2,
  tick: function(world, x, y, meta, time) {
    // Oxidation progression: copper -> exposed -> weathered -> oxidized
    if (!meta) meta = {};
    if (meta.oxStart == null) meta.oxStart = time;
    const elapsed = time - meta.oxStart;

    // thresholds (in world time units). world.time is scaled by gameSpeed in engine.
    const t1 = 60;   // copper -> exposed
    const t2 = 180;  // exposed -> weathered
    const t3 = 420;  // weathered -> oxidized

    if (world.getBlockId(x, y) !== 'copper') return;

    if (elapsed > t1) {
      // preserve oxStart so the next stage continues timing
      world.setBlock(x, y, 'copper_exposed', { oxStart: meta.oxStart });
    }
  }
};
