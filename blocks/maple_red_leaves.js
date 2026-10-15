import { createLeafDecayTick } from './leafDecay.js';

export default {
  id: 'maple_red_leaves',
  displayName: 'Maple Red Leaves',
  shape: 'full',
  solid: false,
  color: '#ff8a65',
  hardness: 0.2,
  isSolid(meta) {
    return meta?.placed === true;
  },
  canPlaceOnTop: true,
  tick: createLeafDecayTick('maple_red_leaves')
};
