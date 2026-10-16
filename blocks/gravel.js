import { fallTick } from './sand.js';

export default {
  id: 'gravel',
  displayName: 'Gravel',
  shape: 'full',
  solid: true,
  color: '#a9a9a9',
  hardness: 2.0,
  isSolid() {
    return true;
  },
  falls: true,
  tick(world, x, y, meta) {
    fallTick(world, x, y, 'gravel', meta);
  }
};
