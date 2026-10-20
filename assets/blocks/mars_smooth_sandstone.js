export default {
  id: 'mars_smooth_sandstone',
  displayName: 'Smooth Martian Sandstone',
  material: 'sandstone',
  kind: 'block',
  tab: 'building',
  recipes: [{ shape: ['ss'], ingredients: { s: 'mars_sandstone' }, count: 2 }],
  tool: 'pickaxe',
  shape: 'full',
  solid: true,
  color: '#d0642e',
  hardness: 2.5,
  isSolid(meta) {
    return meta?.layer !== 'bg';
  }
};
