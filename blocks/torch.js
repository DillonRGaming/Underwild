export default {
  id: 'torch',
  displayName: 'Torch',
  color: '#ff6b35',
  shape: 'torch',
  solid: false,
  transparent: true,
  lightLevel: 15,
  hardness: 0.1,
  maxStack: 64,
  onBreak(world, x, y, meta) {
    // Torches break when the block they're attached to is broken
    const attachedX = meta?.attachedX ?? x;
    const attachedY = meta?.attachedY ?? y + 1;
    
    if (world.inBounds(attachedX, attachedY)) {
      const attachedBlock = world.getBlockId(attachedX, attachedY);
      if (attachedBlock === 'air') {
        // If attached block is air, torch should break
        world.setBlock(x, y, 'air', null);
        world.updateLighting(x, y);
      }
    }
  },
  onPlace(world, x, y, meta) {
    // Determine attachment point based on placement
    const attachedX = x;
    const attachedY = y + 1; // Default to floor attachment
    
    if (world.inBounds(attachedX, attachedY)) {
      const attachedBlock = world.getBlockId(attachedX, attachedY);
      if (attachedBlock !== 'air') {
        meta.attachedX = attachedX;
        meta.attachedY = attachedY;
      }
    }
    
    // Update lighting when torch is placed
    world.updateLighting(x, y);
  }
};

