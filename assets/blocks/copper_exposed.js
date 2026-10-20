import { oxidizeTick } from './oxidize.js';

export default {
  id: 'copper_exposed',
  displayName: 'Exposed Copper',
  material: 'copper',
  kind: 'metal_block',
  tab: 'materials',
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  color: '#a76750',
  hardness: 2,
  tick: oxidizeTick('copper_weathered', 120)
};
