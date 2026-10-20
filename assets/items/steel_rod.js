export default {
  id: 'steel_rod',
  displayName: 'Steel Rod',
  material: 'steel',
  kind: 'rod',
  tab: 'materials',
  recipes: [
    // how it's crafted
    { shape: ['i', 'i'], ingredients: { i: 'steel_ingot' }, count: 4 }
  ],
  type: 'item',
  maxStack: 24
};
