export default {
  id: 'wooden_axe',
  type: 'tool',
  displayName: 'Wooden Axe',
  kind: 'axe',
  tab: 'tools',
  burnTime: 5, // seconds it burns as furnace fuel
  recipes: [
    // how it's crafted
    { shape: ['pp ', 'ps ', ' s '], ingredients: { p: 'planks', s: 'stick' }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'axe',
  material: 'wood',
  toolLevel: 1,
  durability: 59,
  baseSpeedMultiplier: 2.0,
  materialMultiplier: 1.0
};
