export default {
  id: 'stone',
  displayName: 'Stone',
  material: 'stone',
  kind: 'block',
  tab: 'building',
  recipes: [ // how it's crafted
    { shape: ['ss', 'ss'], ingredients: { s: 'stone_gravel' }, count: 1 },
    { shape: ['ppp', 'ppp', 'ppp'], ingredients: { p: 'stone' }, count: 9 }
  ],
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  color: '#888888',
  hardness: 8.0
};
