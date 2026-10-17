export default {
  id: 'gold_sword',
  type: 'tool',
  displayName: 'Gold Sword',
  kind: 'sword',
  tab: 'tools',
  recipes: [ // how it's crafted
    { shapeless: { gold_sword_head: 1, stick: 1 }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'sword',
  material: 'gold',
  toolLevel: 4,
  durability: 32,
  baseDamageMultiplier: 1.5,
  materialMultiplier: 2.5
};
