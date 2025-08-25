export default {
  id: 'iron_shovel',
  type: 'tool',
  displayName: 'Iron Shovel',
  maxStack: 1,
  toolType: 'shovel',
  material: 'iron',
  toolLevel: 3,
  durability: 250,
  // Blocks this tool is effective against
  effectiveAgainst: ['dirt', 'grass', 'sand', 'gravel', 'coarse_dirt', 'mud'],
  // Base speed multiplier for shovel
  baseSpeedMultiplier: 2.0,
  // Material tier multiplier (iron = 2.0)
  materialMultiplier: 2.0
};
