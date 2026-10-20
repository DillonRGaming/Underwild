export default {
  id: 'copper_rod',
  displayName: 'Copper Rod',
  material: 'copper',
  kind: 'rod',
  tab: 'materials',
  recipes: [
    // how it's crafted
    { shape: ['i', 'i'], ingredients: { i: 'copper_ingot' }, count: 4 }
  ],
  type: 'item',
  maxStack: 24
};
