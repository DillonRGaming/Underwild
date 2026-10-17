export default {
  id: 'stone_pebbles',
  displayName: 'Stone Pebbles',
  material: 'stone',
  kind: 'block',
  tab: 'building',
  recipes: [ // how it's crafted
    { shape: ['sss'], ingredients: { s: 'stone' }, count: 3 }
  ],
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  color: '#888888',
  hardness: 6.0
};
