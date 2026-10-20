export default {
  id: 'oak_stairs',
  displayName: 'Oak Stairs',
  material: 'oak',
  kind: 'stairs',
  tab: 'building',
  burnTime: 5, // seconds it burns as furnace fuel
  recipes: [
    // how it's crafted
    { shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'oak_planks' }, count: 4 }
  ],
  tool: 'axe', // mined fastest with this
  color: '#b99e6e',
  shape: 'stairs',
  solid: true,
  transparent: false,
  maxStack: 24,
  isSolid(meta) {
    return true;
  }
};
