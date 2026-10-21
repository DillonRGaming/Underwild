import { grassTick } from './grassSpread.js';

export default {
  id: 'grassy_mud',
  displayName: 'Grassy Mud',
  material: 'mud',
  kind: 'block',
  tab: 'nature',
  tool: 'shovel', // mined fastest with this
  grassy: { bare: 'mud' }, // goes back to this when covered; drawn as it plus a grass overlay
  biomeTint: true, // green pixels take the local biome's grass colour
  soil: ['land'], // what plants can grow on it (see plant.js)
  shape: 'full',
  solid: true,
  hardness: 2.0,
  drop: 'mud',
  tick(world, x, y, meta) {
    grassTick(world, x, y, meta, this.id);
  }
};
