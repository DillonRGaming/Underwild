export default {
  id: 'wooden_pickaxe',
  type: 'tool',
  displayName: 'Wooden Pickaxe',
  maxStack: 1,
  toolType: 'pickaxe',
  material: 'wooden',
  toolLevel: 1,
  durability: 59,
  // Blocks this tool is effective against
  effectiveAgainst: ['stone', 'stone_slab', 'stone_stairs', 'copper', 'copper_exposed', 'copper_weathered', 'copper_oxidized', 'glass'],
  // Base speed multiplier for pickaxe
  baseSpeedMultiplier: 2.0,
  // Material tier multiplier (wooden = 1.0)
  materialMultiplier: 1.0
};
