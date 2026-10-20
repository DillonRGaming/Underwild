export default {
  id: 'birch_stairs',
  displayName: 'Birch Stairs',
  material: 'birch',
  kind: 'stairs',
  tab: 'building',
  burnTime: 5, // seconds it burns as furnace fuel
  recipes: [
    // how it's crafted
    { shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'birch_planks' }, count: 4 }
  ],
  tool: 'axe', // mined fastest with this
  color: '#d4c89f',
  shape: 'stairs',
  solid: true,
  transparent: false,
  maxStack: 24,
  isSolid(meta) {
    return true;
  }
};
