import { grassTick } from './grassSpread.js';

export default {
  id: 'grass_stairs',
  displayName: 'Grass Stairs',
  material: 'grass',
  kind: 'stairs',
  tab: 'nature',
  recipes: [ // how it's crafted
    { shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'grass' }, count: 4 }
  ],
  tool: 'shovel', // mined fastest with this
  grassy: { bare: 'dirt_stairs' }, // goes back to this when covered; drawn as it plus a grass overlay
  biomeTint: true, // green pixels take the local biome's grass colour
  shape: 'stairs',
  solid: true,
  color: '#5aa84f',
  hardness: 2.5,
  isSolid(meta) {
    return true;
  },
  tick(world, x, y, meta) {
    grassTick(world, x, y, meta, this.id);
  }
};
