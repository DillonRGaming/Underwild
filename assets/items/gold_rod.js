export default {
  id: 'gold_rod',
  displayName: 'Gold Rod',
  material: 'gold',
  kind: 'rod',
  tab: 'materials',
  recipes: [
    // how it's crafted
    { shape: ['i', 'i'], ingredients: { i: 'gold_ingot' }, count: 4 }
  ],
  type: 'item',
  maxStack: 24
};
