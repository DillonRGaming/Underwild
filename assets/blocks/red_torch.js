export default {
  id: 'red_torch',
  displayName: 'Red Torch',
  material: 'wood',
  kind: 'light',
  tab: 'functional',
  recipes: [
    // how it's crafted
    { shapeless: { torch: 1, raw_gold: 1 }, count: 1 }
  ],
  color: '#ff3c32',
  shape: 'torch',
  solid: false,
  transparent: true,
  lightLevel: 15,
  lightColor: [1.0, 0.24, 0.2],
  hardness: 0.1,
  maxStack: 24,
  needsSupport: true
};
