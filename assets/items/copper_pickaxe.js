export default {
  id: 'copper_pickaxe',
  type: 'tool',
  displayName: 'Copper Pickaxe',
  kind: 'pickaxe',
  tab: 'tools',
  recipes: [ // how it's crafted
    { shapeless: { copper_pickaxe_head: 1, stick: 1 }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'pickaxe',
  material: 'copper',
  toolLevel: 2,
  durability: 131,
  baseSpeedMultiplier: 1.5,
  materialMultiplier: 1.5
};
