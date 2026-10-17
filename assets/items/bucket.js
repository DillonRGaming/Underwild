export default {
  id: 'bucket',
  displayName: 'Bucket',
  material: 'iron',
  kind: 'tool',
  tab: 'tools',
  recipes: [ // how it's crafted
    { shape: ['i i', ' i '], ingredients: { i: 'steel_ingot' }, count: 1 }
  ],
  type: 'item',
  maxStack: 16
};
