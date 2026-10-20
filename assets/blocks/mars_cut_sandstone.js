export default {
  id: 'mars_cut_sandstone',
  displayName: 'Cut Martian Sandstone',
  material: 'sandstone',
  kind: 'block',
  tab: 'building',
  recipes: [{ shape: ['ss', 'ss'], ingredients: { s: 'mars_sandstone' }, count: 4 }],
  tool: 'pickaxe',
  shape: 'full',
  solid: true,
  color: '#c45826',
  hardness: 2.5,
  isSolid(meta) {
    return meta?.layer !== 'bg';
  }
};
