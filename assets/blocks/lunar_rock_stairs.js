const block = {
  id: 'lunar_rock_stairs',
  displayName: 'Lunarstone Stairs',
  material: 'stone',
  kind: 'stairs',
  tab: 'building',
  recipes: [
    { shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'lunar_rock' }, count: 4 },
    { shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'lunar_rock' }, count: 4 }
  ],
  tool: 'pickaxe',
  shape: 'stairs',
  solid: true,
  hardness: 1.5,
  rockOverlay: true,
  isSolid(meta) {
    return true;
  }
};

// Its old name, kept so older worlds still load (hidden from menus).
export default [block, { ...block, id: 'lunarstone_stairs', hidden: true, drop: 'lunar_rock_stairs', recipes: [] }];
