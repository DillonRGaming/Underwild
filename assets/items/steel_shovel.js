export default {
  id: 'steel_shovel',
  type: 'tool',
  displayName: 'Steel Shovel',
  kind: 'shovel',
  tab: 'tools',
  recipes: [
    // how it's crafted
    { shapeless: { steel_shovel_head: 1, stick: 1 }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'shovel',
  material: 'steel',
  toolLevel: 3,
  durability: 250,
  baseSpeedMultiplier: 2.0,
  materialMultiplier: 2.0
};
