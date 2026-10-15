import { createLeafDecayTick } from './leafDecay.js';

export default {
  id: 'oak_leaves',
  displayName: 'Oak Leaves',
  shape: 'full',
  solid: false,
  color: '#66bb66',
  hardness: 0.2,
  isSolid(meta) {
    return meta?.placed === true;
  },
  canPlaceOnTop: true,
  tick: createLeafDecayTick('oak_leaves')
};
