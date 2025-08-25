export default {
  id: 'gold_axe',
  type: 'tool',
  displayName: 'Gold Axe',
  maxStack: 1,
  toolType: 'axe',
  material: 'gold',
  toolLevel: 4,
  durability: 32,
  // Blocks this tool is effective against
  effectiveAgainst: ['oak_log', 'birch_log', 'spruce_log', 'maple_log', 'oak_planks', 'birch_planks', 'spruce_planks', 'maple_planks', 'oak_stairs', 'birch_stairs', 'spruce_stairs', 'maple_stairs', 'crafting_table', 'chest', 'trapdoor'],
  // Base speed multiplier for axe
  baseSpeedMultiplier: 2.0,
  // Material tier multiplier (gold = 2.5)
  materialMultiplier: 2.5
};
