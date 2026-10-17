export default {
  id: 'copper',
  displayName: 'Copper',
  material: 'copper',
  kind: 'metal_block',
  tab: 'materials',
  recipes: [ // how it's crafted
    { shape: ['iii', 'iii', 'iii'], ingredients: { i: 'copper_ingot' }, count: 1 }
  ],
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  color: '#c1703a',
  hardness: 2,
  tick: function(world, x, y, meta, time) {
    if (!meta) meta = {};
    if (meta.oxStart == null) meta.oxStart = time;
    const elapsed = time - meta.oxStart;

    const t1 = 60;
    const t2 = 180;
    const t3 = 420;

    if (world.getBlockId(x, y) !== 'copper') return;

    if (elapsed > t1) {
      world.setBlock(x, y, 'copper_exposed', { oxStart: meta.oxStart });
    }
  }
};
