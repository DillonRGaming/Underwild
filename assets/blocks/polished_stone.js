export default {
  id: 'polished_stone',
  displayName: 'Polished Stone',
  material: 'stone',
  kind: 'block',
  tab: 'building',
  recipes: [
    // how it's crafted
    { shape: ['ss'], ingredients: { s: 'stone' }, count: 2 }
  ],
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  color: '#888888',
  hardness: 8.0
};
