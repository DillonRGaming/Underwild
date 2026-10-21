export default {
  id: 'pine_stairs',
  displayName: 'Pine Stairs',
  material: 'pine',
  kind: 'stairs',
  tab: 'building',
  burnTime: 5, // seconds it burns as furnace fuel
  recipes: [
    // how it's crafted
    { shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'pine_planks' }, count: 4 }
  ],
  tool: 'axe', // mined fastest with this
  shape: 'stairs',
  solid: true,
  transparent: false,
  maxStack: 24,
  isSolid(meta) {
    return true;
  }
};
