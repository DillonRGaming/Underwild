export default {
  id: 'diamond_pickaxe',
  type: 'tool',
  displayName: 'Diamond Pickaxe',
  maxStack: 1,
  toolType: 'pickaxe',
  material: 'diamond',
  toolLevel: 5,
  durability: 1561,
  // Blocks this tool is effective against
  effectiveAgainst: ['stone', 'stone_slab', 'stone_stairs', 'copper', 'copper_exposed', 'copper_weathered', 'copper_oxidized', 'glass'],
  // Base speed multiplier for pickaxe
  baseSpeedMultiplier: 2.0,
  // Material tier multiplier (diamond = 3.0)
  materialMultiplier: 3.0
};
