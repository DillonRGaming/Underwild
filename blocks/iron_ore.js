export default {
  id: 'iron_ore',
  displayName: 'Iron Ore',
  color: '#8b7355',
  shape: 'full',
  solid: true,
  transparent: false,
  hardness: 4,
  maxStack: 64,
  effectiveAgainst: ['pickaxe'],
  onBreak(world, x, y, meta) {
    // Drop iron item when broken
    const itemX = x * 16 + 8;
    const itemY = (y + 0.5) * 16;
    // Note: ItemEntity creation is handled in the main script
  }
};
