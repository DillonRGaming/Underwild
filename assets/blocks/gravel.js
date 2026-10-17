import { fallTick } from './sand.js';

export default {
  id: 'gravel',
  displayName: 'Gravel',
  material: 'gravel',
  kind: 'block',
  tab: 'nature',
  tool: 'shovel', // mined fastest with this
  soil: ['lakebed'], // what plants can grow on it (see plant.js)
  shape: 'full',
  solid: true,
  color: '#a9a9a9',
  hardness: 2.0,
  isSolid(meta) {
    return meta?.layer !== 'bg';
  },
  falls: true,
  tick(world, x, y, meta) {
    fallTick(world, x, y, 'gravel', meta);
  }
};
