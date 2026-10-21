export default {
  id: 'mars_chiseled_sandstone',
  displayName: 'Chiseled Martian Sandstone',
  material: 'sandstone',
  kind: 'block',
  tab: 'building',
  recipes: [{ shape: ['s', 's'], ingredients: { s: 'mars_cut_sandstone' }, count: 1 }],
  tool: 'pickaxe',
  shape: 'full',
  solid: true,
  hardness: 2.5,
  isSolid(meta) {
    return meta?.layer !== 'bg';
  }
};
