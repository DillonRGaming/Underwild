export default {
  id: 'wooden_shovel',
  type: 'tool',
  displayName: 'Wooden Shovel',
  kind: 'shovel',
  tab: 'tools',
  burnTime: 5, // seconds it burns as furnace fuel
  recipes: [ // how it's crafted
    { shape: [' p ', ' s ', ' s '], ingredients: { p: 'planks', s: 'stick' }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'shovel',
  material: 'wood',
  toolLevel: 1,
  durability: 59,
  baseSpeedMultiplier: 1.5,
  materialMultiplier: 1.0
};
