export default {
  id: 'coal_ore',
  displayName: 'Coal Ore',
  color: '#2d2d2d',
  shape: 'full',
  solid: true,
  transparent: false,
  hardness: 3,
  maxStack: 64,
  effectiveAgainst: ['pickaxe'],
  onBreak(world, x, y, meta) {
    const itemX = x * 16 + 8;
    const itemY = (y + 0.5) * 16;
  }
};
