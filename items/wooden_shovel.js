export default {
  id: 'wooden_shovel',
  type: 'tool',
  displayName: 'Wooden Shovel',
  maxStack: 1,
  toolType: 'shovel',
  material: 'wooden',
  toolLevel: 1,
  durability: 59,
  // Blocks this tool is effective against
  effectiveAgainst: ['dirt', 'grass', 'sand', 'gravel', 'coarse_dirt', 'mud'],
  // Base speed multiplier for wooden material
  baseSpeedMultiplier: 1.5,
  // Material tier multiplier (wooden = 1.0)
  materialMultiplier: 1.0
};
