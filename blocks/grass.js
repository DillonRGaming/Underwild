export default {
  id: 'grass',
  displayName: 'Grass',
  shape: 'full',
  solid: true,
  color: '#5aa84f',
  hardness: 2.5,
  tick(world, x, y, meta, time) {
    if (meta && meta.turnToDirt) {
      meta.dirtTimer = (meta.dirtTimer || 0) + 1;
      
      if (meta.dirtTimer >= 5) {
        world.setBlock(x, y, 'dirt', null);
        world.updateLighting(x, y);
        return;
      }
    }
    
    
    const aboveX = x;
    const aboveY = y - 1;
    if (world.inBounds(aboveX, aboveY)) {
      const aboveId = world.getBlockId(aboveX, aboveY);
      const aboveType = world.getBlockType(aboveX, aboveY);
      
      if (aboveType && aboveType.solid) {
        if (Math.random() < 0.1) {
          world.setBlock(x, y, 'dirt', null);
          world.updateLighting(x, y);
          return;
        }
      }
    }
  }
};
