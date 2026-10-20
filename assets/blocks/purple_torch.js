export default {
  id: 'purple_torch',
  displayName: 'Purple Torch',
  material: 'wood',
  kind: 'light',
  tab: 'functional',
  recipes: [
    // how it's crafted
    { shapeless: { torch: 1, gold_ingot: 1 }, count: 1 }
  ],
  color: '#be46ff',
  shape: 'torch',
  solid: false,
  transparent: true,
  lightLevel: 15,
  lightColor: [0.75, 0.27, 1.0],
  hardness: 0.1,
  maxStack: 24,
  needsSupport: true
};
