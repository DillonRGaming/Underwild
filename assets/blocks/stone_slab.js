export default {
  id: 'stone_slab',
  displayName: 'Stone Slab',
  material: 'stone',
  kind: 'slab',
  tab: 'building',
  recipes: [
    // how it's crafted
    { shape: ['pp', 'pp'], ingredients: { p: 'stone' }, count: 6 }
  ],
  tool: 'pickaxe', // mined fastest with this
  shape: 'slab',
  solid: true,
  color: '#777777',
  hardness: 6,
  isSolid(meta) {
    return true;
  }
};
