export default {
  id: 'stick',
  displayName: 'Stick',
  material: 'wood',
  kind: 'material',
  tab: 'materials',
  burnTime: 2.5, // seconds it burns as furnace fuel
  recipes: [ // how it's crafted
    { shape: ['p', 'p'], ingredients: { p: 'planks' }, count: 4 }
  ],
  maxStack: 24
};
