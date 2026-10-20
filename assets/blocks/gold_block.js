export default {
  id: 'gold_block',
  displayName: 'Block of Gold',
  material: 'gold',
  kind: 'metal_block',
  tab: 'materials',
  recipes: [
    // how it's crafted
    { shape: ['iii', 'iii', 'iii'], ingredients: { i: 'gold_ingot' }, count: 1 }
  ],
  tool: 'pickaxe', // mined fastest with this
  color: '#e8a83a',
  shape: 'full',
  solid: true,
  transparent: false,
  hardness: 5,
  maxStack: 24,
  effectiveAgainst: ['pickaxe']
};
