export default {
  id: 'gold_pickaxe',
  type: 'tool',
  displayName: 'Gold Pickaxe',
  maxStack: 1,
  toolType: 'pickaxe',
  material: 'gold',
  toolLevel: 4,
  durability: 32,
  // Blocks this tool is effective against
  effectiveAgainst: ['stone', 'stone_slab', 'stone_stairs', 'copper', 'copper_exposed', 'copper_weathered', 'copper_oxidized', 'glass'],
  // Base speed multiplier for pickaxe
  baseSpeedMultiplier: 2.0,
  // Material tier multiplier (gold = 2.5)
  materialMultiplier: 2.5
};
