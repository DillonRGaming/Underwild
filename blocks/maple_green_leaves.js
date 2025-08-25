import { createLeafDecayTick } from './leafDecay.js';

export default {
  id: 'maple_green_leaves',
  displayName: 'Maple Green Leaves',
  shape: 'full',
  solid: false,
  color: '#66cc66',
  hardness: 0.2,
  isSolid(meta) {
    return meta?.placed === true;
  },
  canPlaceOnTop: true,
  tick: createLeafDecayTick('maple_green_leaves')
};
