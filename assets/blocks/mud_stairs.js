export default {
  id: 'mud_stairs',
  displayName: 'Mud Stairs',
  material: 'mud',
  kind: 'stairs',
  tab: 'nature',
  recipes: [ // how it's crafted
    { shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'mud' }, count: 4 }
  ],
  tool: 'shovel', // mined fastest with this
  shape: 'stairs',
  solid: true,
  color: '#6a3b17',
  hardness: 1.8,
  isSolid(meta) {
    return true;
  }
};
