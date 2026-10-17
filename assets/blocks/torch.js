export default {
  id: 'torch',
  displayName: 'Torch',
  material: 'wood',
  kind: 'light',
  tab: 'functional',
  recipes: [ // how it's crafted
    { shape: ['c', 's'], ingredients: { c: 'coal', s: 'stick' }, count: 4 }
  ],
  color: '#ff6b35',
  shape: 'torch',
  solid: false,
  transparent: true,
  lightLevel: 15,
  hardness: 0.1,
  maxStack: 24,
  needsSupport: true
};
