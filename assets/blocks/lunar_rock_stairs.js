export default {
  id: 'lunar_rock_stairs',
  displayName: 'Lunarstone Stairs',
  material: 'stone',
  kind: 'stairs',
  tab: 'building',
  recipes: [
    { shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'lunar_rock' }, count: 4 },
    { shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'lunarstone' }, count: 4 }
  ],
  tool: 'pickaxe',
  shape: 'stairs',
  solid: true,
  color: '#f0f2f5',
  hardness: 1.5,
  rockOverlay: true,
  isSolid(meta) {
    return true;
  }
};
