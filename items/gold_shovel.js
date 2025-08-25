export default {
  id: 'gold_shovel',
  type: 'tool',
  displayName: 'Gold Shovel',
  maxStack: 1,
  toolType: 'shovel',
  material: 'gold',
  toolLevel: 4,
  durability: 32,
  // Blocks this tool is effective against
  effectiveAgainst: ['dirt', 'grass', 'sand', 'gravel', 'coarse_dirt', 'mud'],
  // Base speed multiplier for shovel
  baseSpeedMultiplier: 2.0,
  // Material tier multiplier (gold = 2.5)
  materialMultiplier: 2.5
};
