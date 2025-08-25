export default {
  id: 'iron_axe',
  type: 'tool',
  displayName: 'Iron Axe',
  maxStack: 1,
  toolType: 'axe',
  material: 'iron',
  toolLevel: 3,
  durability: 250,
  // Blocks this tool is effective against
  effectiveAgainst: ['oak_log', 'birch_log', 'spruce_log', 'maple_log', 'oak_planks', 'birch_planks', 'spruce_planks', 'maple_planks', 'oak_stairs', 'birch_stairs', 'spruce_stairs', 'maple_stairs', 'crafting_table', 'chest', 'trapdoor'],
  // Base speed multiplier for axe
  baseSpeedMultiplier: 2.0,
  // Material tier multiplier (iron = 2.0)
  materialMultiplier: 2.0
};
