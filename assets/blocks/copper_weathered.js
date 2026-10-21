import { oxidizeTick } from './oxidize.js';

export default {
  id: 'copper_weathered',
  displayName: 'Weathered Copper',
  material: 'copper',
  kind: 'metal_block',
  tab: 'materials',
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  hardness: 2,
  tick: oxidizeTick('copper_oxidized', 420)
};
