export default {
  id: 'spruce_stairs',
  displayName: 'Spruce Stairs',
  material: 'spruce',
  kind: 'stairs',
  tab: 'building',
  burnTime: 5, // seconds it burns as furnace fuel
  recipes: [
    // how it's crafted
    { shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'spruce_planks' }, count: 4 }
  ],
  tool: 'axe', // mined fastest with this
  color: '#8a6e3d',
  shape: 'stairs',
  solid: true,
  transparent: false,
  maxStack: 24,
  isSolid(meta) {
    return true;
  }
};
