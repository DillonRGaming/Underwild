export default {
  id: 'steel_sword',
  type: 'tool',
  displayName: 'Steel Sword',
  kind: 'sword',
  tab: 'tools',
  recipes: [
    // how it's crafted
    { shapeless: { steel_sword_head: 1, stick: 1 }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'sword',
  material: 'steel',
  toolLevel: 3,
  durability: 250,
  baseDamageMultiplier: 1.5,
  materialMultiplier: 2.0
};
