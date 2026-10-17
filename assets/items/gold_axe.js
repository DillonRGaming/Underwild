export default {
  id: 'gold_axe',
  type: 'tool',
  displayName: 'Gold Axe',
  kind: 'axe',
  tab: 'tools',
  recipes: [ // how it's crafted
    { shapeless: { gold_axe_head: 1, stick: 1 }, count: 1 }
  ],
  maxStack: 1,
  toolType: 'axe',
  material: 'gold',
  toolLevel: 4,
  durability: 32,
  baseSpeedMultiplier: 2.0,
  materialMultiplier: 2.5
};
