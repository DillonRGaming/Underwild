export default {
  id: 'gold_shovel',
  type: 'tool',
  displayName: 'Gold Shovel',
  kind: 'shovel',
  tab: 'tools',
  recipes: [
    // how it's crafted
    { shapeless: { gold_shovel_head: 1, stick: 1 }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'shovel',
  material: 'gold',
  toolLevel: 4,
  durability: 32,
  baseSpeedMultiplier: 2.0,
  materialMultiplier: 2.5
};
