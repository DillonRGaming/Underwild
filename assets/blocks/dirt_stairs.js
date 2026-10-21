import { spreadTick } from './grassSpread.js';

export default {
  id: 'dirt_stairs',
  displayName: 'Dirt Stairs',
  material: 'dirt',
  kind: 'stairs',
  tab: 'nature',
  recipes: [
    // how it's crafted
    { shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'dirt' }, count: 4 }
  ],
  tool: 'shovel', // mined fastest with this
  growsGrass: 'grass_stairs', // grass creeping onto it turns it into this
  shape: 'stairs',
  solid: true,
  hardness: 2.0,
  isSolid(meta) {
    return true;
  },
  tick(world, x, y, meta) {
    spreadTick(world, x, y, meta, this.id);
  }
};
