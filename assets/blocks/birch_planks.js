export default {
  id: 'birch_planks',
  displayName: 'Birch Planks',
  material: 'birch',
  kind: 'planks',
  tab: 'building',
  burnTime: 7.5, // seconds it burns as furnace fuel
  recipes: [ // how it's crafted
    { shapeless: { birch_log: 1 }, count: 4 }
  ],
  tool: 'axe', // mined fastest with this
  color: '#d4c89f',
  shape: 'full',
  solid: true,
  transparent: false,
  maxStack: 24
};
