export default {
  id: 'diamond_shovel',
  type: 'tool',
  displayName: 'Diamond Shovel',
  maxStack: 1,
  toolType: 'shovel',
  material: 'diamond',
  toolLevel: 5,
  durability: 1561,
  // Blocks this tool is effective against
  effectiveAgainst: ['dirt', 'grass', 'sand', 'gravel', 'coarse_dirt', 'mud'],
  // Base speed multiplier for shovel
  baseSpeedMultiplier: 2.0,
  // Material tier multiplier (diamond = 3.0)
  materialMultiplier: 3.0
};
