export default {
  id: 'mars_sandstone_stairs',
  displayName: 'Martian Sandstone Stairs',
  material: 'sandstone',
  kind: 'stairs',
  tab: 'building',
  recipes: [{ shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'mars_sandstone' }, count: 4 }],
  tool: 'pickaxe',
  shape: 'stairs',
  solid: true,
  hardness: 2.0,
  rockOverlay: true,
  isSolid(meta) {
    return true;
  }
};
