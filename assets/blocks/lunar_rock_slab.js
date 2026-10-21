const block = {
  id: 'lunar_rock_slab',
  displayName: 'Lunarstone Slab',
  material: 'stone',
  kind: 'slab',
  tab: 'building',
  recipes: [
    { shape: ['pp', 'pp'], ingredients: { p: 'lunar_rock' }, count: 6 },
    { shape: ['pp', 'pp'], ingredients: { p: 'lunar_rock' }, count: 6 }
  ],
  tool: 'pickaxe',
  shape: 'slab',
  solid: true,
  hardness: 1.5,
  rockOverlay: true,
  isSolid(meta) {
    return true;
  }
};

// Its old name, kept so older worlds still load (hidden from menus).
export default [block, { ...block, id: 'lunarstone_slab', hidden: true, drop: 'lunar_rock_slab', recipes: [] }];
