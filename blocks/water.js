export default {
  id: 'water',
  displayName: 'Water',
  shape: 'full',
  solid: false,
  color: '#3b72d4',
  hardness: 100,
  isSolid() {
    return false;
  },
  tick(world, x, y, meta, time) {
    if (y < world.height - 1) {
      const below = world.getBlockId(x, y + 1);
      if (below === 'air') {
        world.setBlock(x, y, 'air');
        world.setBlock(x, y + 1, 'water');
        return;
      }
      
      const canFlowLeft = x > 0 && world.getBlockId(x - 1, y) === 'air';
      const canFlowRight = x < world.width - 1 && world.getBlockId(x + 1, y) === 'air';
      
      if (canFlowLeft && canFlowRight) {
        if (Math.random() < 0.5) {
          world.setBlock(x, y, 'air');
          world.setBlock(x - 1, y, 'water');
        } else {
          world.setBlock(x, y, 'air');
          world.setBlock(x + 1, y, 'water');
        }
      } else if (canFlowLeft) {
        world.setBlock(x, y, 'air');
        world.setBlock(x - 1, y, 'water');
      } else if (canFlowRight) {
        world.setBlock(x, y, 'air');
        world.setBlock(x + 1, y, 'water');
      }
    }
  }
};
