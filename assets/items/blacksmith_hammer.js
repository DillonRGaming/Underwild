export default {
  id: 'blacksmith_hammer',
  displayName: 'Blacksmith Hammer',
  material: 'iron',
  kind: 'tool',
  tab: 'tools',
  recipes: [ // how it's crafted
    { shape: ['iii', 'iii', ' s '], ingredients: { i: 'steel_ingot', s: 'stick' }, count: 1 }
  ],
  type: 'item',
  maxStack: 1
};
