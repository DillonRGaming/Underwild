export default {
  id: 'stone_bricks',
  displayName: 'Stone Bricks',
  material: 'stone',
  kind: 'block',
  tab: 'building',
  recipes: [
    // how it's crafted
    { shape: ['pp', 'pp'], ingredients: { p: 'polished_stone' }, count: 4 }
  ],
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  hardness: 8.0
};
