export default {
  id: 'maple_planks',
  displayName: 'Maple Planks',
  material: 'maple',
  kind: 'planks',
  tab: 'building',
  burnTime: 7.5, // seconds it burns as furnace fuel
  recipes: [ // how it's crafted
    { shapeless: { maple_log: 1 }, count: 4 }
  ],
  tool: 'axe', // mined fastest with this
  shape: 'full',
  solid: true,
  color: '#D2691E',
  hardness: 2
};
