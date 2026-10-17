export default {
  id: 'gold_pickaxe',
  type: 'tool',
  displayName: 'Gold Pickaxe',
  kind: 'pickaxe',
  tab: 'tools',
  recipes: [ // how it's crafted
    { shapeless: { gold_pickaxe_head: 1, stick: 1 }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'pickaxe',
  material: 'gold',
  toolLevel: 4,
  durability: 32,
  baseSpeedMultiplier: 2.0,
  materialMultiplier: 2.5
};
