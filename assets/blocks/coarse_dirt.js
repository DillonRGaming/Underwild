import { spreadTick } from './grassSpread.js';

export default {
  id: 'coarse_dirt',
  displayName: 'Coarse Dirt',
  material: 'dirt',
  kind: 'block',
  tab: 'nature',
  recipes: [
    // how it's crafted
    { shapeless: { dirt: 1, gravel: 1 }, count: 2 }
  ],
  tool: 'shovel', // mined fastest with this
  growsGrass: 'grass', // grass creeping onto it turns it into this
  soil: ['land'], // what plants can grow on it (see plant.js)
  shape: 'full',
  solid: true,
  color: '#8a5b37',
  hardness: 2.2,
  tick(world, x, y, meta) {
    spreadTick(world, x, y, meta, this.id);
  }
};
