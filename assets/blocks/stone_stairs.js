export default {
  id: 'stone_stairs',
  displayName: 'Stone Stairs',
  material: 'stone',
  kind: 'stairs',
  tab: 'building',
  recipes: [
    // how it's crafted
    { shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'stone' }, count: 4 }
  ],
  tool: 'pickaxe', // mined fastest with this
  shape: 'stairs',
  solid: true,
  color: '#767676',
  hardness: 7,
  isSolid(meta) {
    return true;
  }
};
