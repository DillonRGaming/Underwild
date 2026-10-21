export default {
  id: 'crafting_table',
  displayName: 'Crafting Table',
  material: 'wood',
  kind: 'station',
  opens: 'crafting', // right-click opens the 3x3 crafting grid
  tab: 'functional',
  burnTime: 7.5, // seconds it burns as furnace fuel
  recipes: [
    // how it's crafted
    { shape: ['pp', 'pp'], ingredients: { p: 'planks' }, count: 1 }
  ],
  tool: 'axe', // mined fastest with this
  shape: 'full',
  solid: true,
  texture: 'crafting_table.png',
  hardness: 2.5,
  lightLevel: 0,
  maxStack: 24,
  canPlaceOnGround: true,
  canPlaceOn: true,
  tick: null
};
