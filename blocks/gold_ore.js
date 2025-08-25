export default {
  id: 'gold_ore',
  displayName: 'Gold Ore',
  color: '#ffd700',
  shape: 'full',
  solid: true,
  transparent: false,
  hardness: 5,
  maxStack: 64,
  effectiveAgainst: ['pickaxe'],
  onBreak(world, x, y, meta) {
    // Drop gold item when broken
    const itemX = x * 16 + 8;
    const itemY = (y + 0.5) * 16;
    // Note: ItemEntity creation is handled in the main script
  }
};
