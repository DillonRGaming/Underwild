export default {
  id: 'wooden_axe',
  type: 'tool',
  displayName: 'Wooden Axe',
  maxStack: 1,
  toolType: 'axe',
  material: 'wooden',
  toolLevel: 1,
  durability: 59,
  // Blocks this tool is effective against
  effectiveAgainst: ['oak_log', 'birch_log', 'spruce_log', 'maple_log', 'oak_planks', 'birch_planks', 'spruce_planks', 'maple_planks', 'oak_stairs', 'birch_stairs', 'spruce_stairs', 'maple_stairs', 'crafting_table', 'chest', 'trapdoor'],
  // Base speed multiplier for axe
  baseSpeedMultiplier: 2.0,
  // Material tier multiplier (wooden = 1.0)
  materialMultiplier: 1.0
};
