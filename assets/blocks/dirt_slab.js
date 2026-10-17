import { spreadTick } from './grassSpread.js';

export default {
  id: 'dirt_slab',
  displayName: 'Dirt Slab',
  material: 'dirt',
  kind: 'slab',
  tab: 'nature',
  recipes: [ // how it's crafted
    { shape: ['pp', 'pp'], ingredients: { p: 'dirt' }, count: 6 }
  ],
  tool: 'shovel', // mined fastest with this
  growsGrass: 'grass_slab', // grass creeping onto it turns it into this
  shape: 'slab',
  solid: true,
  color: '#7a4b27',
  hardness: 2.0,
  isSolid(meta) {
    return true;
  },
  tick(world, x, y, meta) {
    spreadTick(world, x, y, meta, this.id);
  }
};
