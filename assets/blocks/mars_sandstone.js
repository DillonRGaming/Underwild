export default {
  id: 'mars_sandstone',
  displayName: 'Martian Sandstone',
  material: 'sandstone',
  kind: 'block',
  tab: 'building',
  recipes: [{ shape: ['ss', 'ss'], ingredients: { s: 'mars_sand' }, count: 1 }],
  tool: 'pickaxe',
  shape: 'full',
  solid: true,
  soil: ['mars', 'mars_sandstone', 'stone'],
  color: '#c85a28',
  hardness: 2.5,
  rockOverlay: true,
  isSolid(meta) {
    return meta?.layer !== 'bg';
  }
};
