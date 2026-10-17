export default {
  id: 'steel_block',
  displayName: 'Block of Steel',
  material: 'steel',
  kind: 'metal_block',
  tab: 'materials',
  recipes: [ // how it's crafted
    { shape: ['iii', 'iii', 'iii'], ingredients: { i: 'steel_ingot' }, count: 1 }
  ],
  tool: 'pickaxe', // mined fastest with this
  color: '#8e9aa6',
  shape: 'full',
  solid: true,
  transparent: false,
  hardness: 6,
  maxStack: 24,
  effectiveAgainst: ['pickaxe']
};
