export default {
  id: 'iron_pickaxe',
  type: 'tool',
  displayName: 'Iron Pickaxe',
  maxStack: 1,
  toolType: 'pickaxe',
  material: 'iron',
  toolLevel: 3,
  durability: 250,
  // Blocks this tool is effective against
  effectiveAgainst: ['stone', 'stone_slab', 'stone_stairs', 'copper', 'copper_exposed', 'copper_weathered', 'copper_oxidized', 'glass'],
  // Base speed multiplier for pickaxe
  baseSpeedMultiplier: 2.0,
  // Material tier multiplier (iron = 2.0)
  materialMultiplier: 2.0
};
