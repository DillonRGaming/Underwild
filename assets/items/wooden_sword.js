export default {
  id: 'wooden_sword',
  type: 'tool',
  displayName: 'Wooden Sword',
  kind: 'sword',
  tab: 'tools',
  burnTime: 5, // seconds it burns as furnace fuel
  recipes: [ // how it's crafted
    { shape: [' p ', ' p ', ' s '], ingredients: { p: 'planks', s: 'stick' }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'sword',
  material: 'wood',
  toolLevel: 1,
  durability: 59,
  baseDamageMultiplier: 1.5,
  materialMultiplier: 1.0
};
