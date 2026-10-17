export default {
  id: 'copper_shovel',
  type: 'tool',
  displayName: 'Copper Shovel',
  kind: 'shovel',
  tab: 'tools',
  recipes: [ // how it's crafted
    { shapeless: { copper_shovel_head: 1, stick: 1 }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'shovel',
  material: 'copper',
  toolLevel: 2,
  durability: 131,
  baseSpeedMultiplier: 2.0,
  materialMultiplier: 1.5
};
