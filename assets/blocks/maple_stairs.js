export default {
  id: 'maple_stairs',
  displayName: 'Maple Stairs',
  material: 'maple',
  kind: 'stairs',
  tab: 'building',
  burnTime: 5, // seconds it burns as furnace fuel
  recipes: [ // how it's crafted
    { shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'maple_planks' }, count: 4 }
  ],
  tool: 'axe', // mined fastest with this
  shape: 'stairs',
  solid: true,
  color: '#D2691E',
  hardness: 2,
  isSolid(meta) {
    return true;
  }
};
