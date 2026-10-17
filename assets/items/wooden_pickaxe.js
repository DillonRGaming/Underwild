export default {
  id: 'wooden_pickaxe',
  type: 'tool',
  displayName: 'Wooden Pickaxe',
  kind: 'pickaxe',
  tab: 'tools',
  burnTime: 5, // seconds it burns as furnace fuel
  recipes: [ // how it's crafted
    { shape: ['ppp', ' s ', ' s '], ingredients: { p: 'planks', s: 'stick' }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'pickaxe',
  material: 'wood',
  toolLevel: 1,
  durability: 59,
  baseSpeedMultiplier: 2.0,
  materialMultiplier: 1.0
};
