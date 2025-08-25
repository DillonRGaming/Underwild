export default {
  id: 'diamond_ore',
  displayName: 'Diamond Ore',
  color: '#b9f2ff',
  shape: 'full',
  solid: true,
  transparent: false,
  hardness: 6,
  maxStack: 64,
  effectiveAgainst: ['pickaxe'],
  onBreak(world, x, y, meta) {
    // Drop diamond item when broken
    const itemX = x * 16 + 8;
    const itemY = (y + 0.5) * 16;
    // Note: ItemEntity creation is handled in the main script
  }
};
