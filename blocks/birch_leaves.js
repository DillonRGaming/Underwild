import { createLeafDecayTick } from './leafDecay.js';

export default {
  id: 'birch_leaves',
  displayName: 'Birch Leaves',
  shape: 'full',
  solid: false,
  color: '#88cc88',
  hardness: 0.2,
  isSolid(meta) {
    return meta?.placed === true;
  },
  canPlaceOnTop: true,
  tick: createLeafDecayTick('birch_leaves')
};
