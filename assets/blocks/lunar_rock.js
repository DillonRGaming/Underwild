const block = {
  id: 'lunar_rock',
  displayName: 'Lunarstone',
  material: 'stone',
  kind: 'block',
  tab: 'building',
  recipes: [],
  tool: 'pickaxe',
  shape: 'full',
  solid: true,
  soil: ['moon', 'lunar_rock', 'stone'],
  hardness: 1.5,
  rockOverlay: true
};

// Its old name, kept so older worlds still load (hidden from menus).
export default [block, { ...block, id: 'lunarstone', hidden: true, drop: 'lunar_rock', recipes: [] }];
