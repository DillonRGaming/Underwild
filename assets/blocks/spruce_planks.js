export default {
  id: 'spruce_planks',
  displayName: 'Spruce Planks',
  material: 'spruce',
  kind: 'planks',
  tab: 'building',
  burnTime: 7.5, // seconds it burns as furnace fuel
  recipes: [
    // how it's crafted
    { shapeless: { spruce_log: 1 }, count: 4 }
  ],
  tool: 'axe', // mined fastest with this
  color: '#8a6e3d',
  shape: 'full',
  solid: true,
  transparent: false,
  maxStack: 24
};
