export default {
  id: 'pine_planks',
  displayName: 'Pine Planks',
  material: 'pine',
  kind: 'planks',
  tab: 'building',
  burnTime: 7.5, // seconds it burns as furnace fuel
  recipes: [
    // how it's crafted
    { shapeless: { pine_log: 1 }, count: 4 }
  ],
  tool: 'axe', // mined fastest with this
  color: '#4a3528',
  shape: 'full',
  solid: true,
  transparent: false,
  maxStack: 24
};
