export default {
  id: 'steel_pickaxe',
  type: 'tool',
  displayName: 'Steel Pickaxe',
  kind: 'pickaxe',
  tab: 'tools',
  recipes: [ // how it's crafted
    { shapeless: { steel_pickaxe_head: 1, stick: 1 }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'pickaxe',
  material: 'steel',
  toolLevel: 3,
  durability: 250,
  baseSpeedMultiplier: 2.0,
  materialMultiplier: 2.0
};
