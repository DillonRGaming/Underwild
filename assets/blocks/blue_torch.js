export default {
  id: 'blue_torch',
  displayName: 'Blue Torch',
  material: 'wood',
  kind: 'light',
  tab: 'functional',
  recipes: [
    // how it's crafted
    { shapeless: { torch: 1, raw_steel: 1 }, count: 1 }
  ],
  shape: 'torch',
  solid: false,
  transparent: true,
  lightLevel: 15,
  lightColor: [0.24, 0.43, 1.0],
  hardness: 0.1,
  maxStack: 24,
  needsSupport: true
};
