import { oxidizeTick } from './oxidize.js';

export default {
  id: 'copper',
  displayName: 'Copper',
  material: 'copper',
  kind: 'metal_block',
  tab: 'materials',
  recipes: [
    // how it's crafted
    { shape: ['iii', 'iii', 'iii'], ingredients: { i: 'copper_ingot' }, count: 1 }
  ],
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  color: '#c1703a',
  hardness: 2,
  tick: oxidizeTick('copper_exposed', 60)
};
