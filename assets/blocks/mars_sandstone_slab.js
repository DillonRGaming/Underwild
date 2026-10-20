export default {
  id: 'mars_sandstone_slab',
  displayName: 'Martian Sandstone Slab',
  material: 'sandstone',
  kind: 'slab',
  tab: 'building',
  recipes: [{ shape: ['pp', 'pp'], ingredients: { p: 'mars_sandstone' }, count: 6 }],
  tool: 'pickaxe',
  shape: 'slab',
  solid: true,
  color: '#c85a28',
  hardness: 2.0,
  rockOverlay: true,
  isSolid(meta) {
    return true;
  }
};
