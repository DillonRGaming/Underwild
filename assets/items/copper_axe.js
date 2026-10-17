export default {
  id: 'copper_axe',
  type: 'tool',
  displayName: 'Copper Axe',
  kind: 'axe',
  tab: 'tools',
  recipes: [ // how it's crafted
    { shapeless: { copper_axe_head: 1, stick: 1 }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'axe',
  material: 'copper',
  toolLevel: 2,
  durability: 131,
  baseSpeedMultiplier: 2.0,
  materialMultiplier: 1.5
};
