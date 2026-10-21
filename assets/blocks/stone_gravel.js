import { fallTick } from './sand.js';

export default {
  id: 'stone_gravel',
  displayName: 'Stone Gravel',
  material: 'stone',
  kind: 'block',
  tab: 'building',
  recipes: [
    // how it's crafted
    { shape: ['c'], ingredients: { c: 'stone_pebbles' }, count: 2 }
  ],
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  hardness: 1.5,
  isSolid(meta) {
    return meta?.layer !== 'bg';
  },
  falls: true,
  tick(world, x, y, meta) {
    fallTick(world, x, y, 'stone_gravel', meta);
  }
};
