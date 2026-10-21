export default {
  id: 'cyan_torch',
  displayName: 'Cyan Torch',
  material: 'wood',
  kind: 'light',
  tab: 'functional',
  recipes: [
    // how it's crafted
    { shapeless: { torch: 1, copper_ingot: 1 }, count: 1 }
  ],
  shape: 'torch',
  solid: false,
  transparent: true,
  lightLevel: 15,
  lightColor: [0.24, 0.94, 1.0],
  hardness: 0.1,
  maxStack: 24,
  needsSupport: true
};
