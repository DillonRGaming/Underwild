import { gameClock } from '../../src/core/gameClock.js';
import { waterLevel } from '../../src/logic/water.js';

// A puddle only one layer deep dries up after this long.
const PUDDLE_DRY_MS = 10000;

export default {
  id: 'water',
  hidden: true, // carried in buckets, never as a block
  noDrop: true, // blowing it up gives nothing
  displayName: 'Water',
  shape: 'full',
  solid: false,
  color: '#3b72d4',
  hardness: 100,
  isSolid() {
    return false;
  },
  // Flow is handled by the water simulation in src/logic/water.js; this just dries out
  // the thinnest puddles.
  tick(world, x, y, meta) {
    const thin = waterLevel({ id: 'water', meta }) <= 1 && world.getBlockId(x, y - 1) !== 'water';
    if (!thin) {
      delete meta.thinSince;
      return;
    }
    const now = gameClock.now();
    meta.thinSince ??= now;
    if (now - meta.thinSince >= PUDDLE_DRY_MS) world.setBlock(x, y, 'air', null);
  }
};
