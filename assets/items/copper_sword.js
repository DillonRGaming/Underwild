export default {
  id: 'copper_sword',
  type: 'tool',
  displayName: 'Copper Sword',
  kind: 'sword',
  tab: 'tools',
  recipes: [
    // how it's crafted
    { shapeless: { copper_sword_head: 1, stick: 1 }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'sword',
  material: 'copper',
  toolLevel: 2,
  durability: 250,
  baseDamageMultiplier: 1.5,
  materialMultiplier: 1.5
};
