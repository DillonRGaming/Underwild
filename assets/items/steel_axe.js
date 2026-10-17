export default {
  id: 'steel_axe',
  type: 'tool',
  displayName: 'Steel Axe',
  kind: 'axe',
  tab: 'tools',
  recipes: [ // how it's crafted
    { shapeless: { steel_axe_head: 1, stick: 1 }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'axe',
  material: 'steel',
  toolLevel: 3,
  durability: 250,
  baseSpeedMultiplier: 2.0,
  materialMultiplier: 2.0
};
