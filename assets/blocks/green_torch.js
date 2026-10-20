export default {
  id: 'green_torch',
  displayName: 'Green Torch',
  material: 'wood',
  kind: 'light',
  tab: 'functional',
  recipes: [
    // how it's crafted
    { shapeless: { torch: 1, raw_copper: 1 }, count: 1 }
  ],
  color: '#3cff50',
  shape: 'torch',
  solid: false,
  transparent: true,
  lightLevel: 15,
  lightColor: [0.24, 1.0, 0.31],
  hardness: 0.1,
  maxStack: 24,
  needsSupport: true
};
