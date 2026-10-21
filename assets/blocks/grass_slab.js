import { grassTick } from './grassSpread.js';

export default {
  id: 'grass_slab',
  displayName: 'Grass Slab',
  material: 'grass',
  kind: 'slab',
  tab: 'nature',
  recipes: [
    // how it's crafted
    { shape: ['pp', 'pp'], ingredients: { p: 'grass' }, count: 6 }
  ],
  tool: 'shovel', // mined fastest with this
  grassy: { bare: 'dirt_slab' }, // goes back to this when covered; drawn as it plus a grass overlay
  biomeTint: true, // green pixels take the local biome's grass colour
  shape: 'slab',
  solid: true,
  hardness: 2.5,
  isSolid(meta) {
    return true;
  },
  tick(world, x, y, meta) {
    grassTick(world, x, y, meta, this.id);
  }
};
