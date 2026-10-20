export default {
  id: 'oak_planks',
  displayName: 'Oak Planks',
  material: 'oak',
  kind: 'planks',
  tab: 'building',
  burnTime: 7.5, // seconds it burns as furnace fuel
  recipes: [
    // how it's crafted
    { shapeless: { oak_log: 1 }, count: 4 }
  ],
  tool: 'axe', // mined fastest with this
  shape: 'full',
  solid: true,
  color: '#a08060',
  hardness: 4
};
