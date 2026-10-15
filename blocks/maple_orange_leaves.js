import { createLeafDecayTick } from './leafDecay.js';

export default {
  id: 'maple_orange_leaves',
  displayName: 'Maple Orange Leaves',
  shape: 'full',
  solid: false,
  color: '#ffbb66',
  hardness: 0.2,
  isSolid(meta) {
    return meta?.placed === true;
  },
  canPlaceOnTop: true,
  tick: createLeafDecayTick('maple_orange_leaves')
};
