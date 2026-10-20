export default {
  id: 'mud_slab',
  displayName: 'Mud Slab',
  material: 'mud',
  kind: 'slab',
  tab: 'nature',
  recipes: [
    // how it's crafted
    { shape: ['pp', 'pp'], ingredients: { p: 'mud' }, count: 6 }
  ],
  tool: 'shovel', // mined fastest with this
  shape: 'slab',
  solid: true,
  color: '#6a3b17',
  hardness: 1.8,
  isSolid(meta) {
    return true;
  }
};
