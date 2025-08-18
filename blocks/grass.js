export default {
  id: 'grass',
  displayName: 'Grass',
  shape: 'full',
  solid: true,
  color: '#5aa84f',
  hardness: 0.6,
  tick(world, x, y, meta, time) {
    // Check if this grass block should turn to dirt quickly (when a block is placed on top)
    if (meta && meta.turnToDirt) {
      // Increment the timer
      meta.dirtTimer = (meta.dirtTimer || 0) + 1;
      
      // If the timer reaches a certain value, turn to dirt (fast transformation)
      if (meta.dirtTimer >= 5) { // 5 ticks for quick transformation
        world.setBlock(x, y, 'dirt', null);
        // Update lighting around the changed block
        world.updateLighting(x, y);
        return;
      }
    }
    
    
    // Check if there's a solid block above the grass
    const aboveX = x;
    const aboveY = y - 1;
    if (world.inBounds(aboveX, aboveY)) {
      const aboveId = world.getBlockId(aboveX, aboveY);
      const aboveType = world.getBlockType(aboveX, aboveY);
      
      // If there's a solid block above, turn to dirt (but not instantly)
      if (aboveType && aboveType.solid) {
        // Check if we should turn to dirt (with a random chance to make it not instant)
        if (Math.random() < 0.1) { // 10% chance per tick
          world.setBlock(x, y, 'dirt', null);
          // Update lighting around the changed block
          world.updateLighting(x, y);
          return;
        }
      }
    }
  }
};
