export default {
  id: 'lunar_rock_slab',
  displayName: 'Lunarstone Slab',
  material: 'stone',
  kind: 'slab',
  tab: 'building',
  recipes: [
    { shape: ['pp', 'pp'], ingredients: { p: 'lunar_rock' }, count: 6 },
    { shape: ['pp', 'pp'], ingredients: { p: 'lunarstone' }, count: 6 }
  ],
  tool: 'pickaxe',
  shape: 'slab',
  solid: true,
  color: '#f0f2f5',
  hardness: 1.5,
  rockOverlay: true,
  isSolid(meta) {
    return true;
  }
};
