import { hasOpenSide } from './dirt.js';

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

    // Grass dies back to dirt once nothing is open above or beside it.
    if (!hasOpenSide(world, x, y) && Math.random() < 0.1) {
      world.setBlock(x, y, 'dirt', null);
      world.updateLighting(x, y);
      return;
    }
  }
};
