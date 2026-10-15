import { createLeafDecayTick } from './leafDecay.js';

export default {
  id: 'pine_leaves',
  displayName: 'Pine Leaves',
  shape: 'full',
  solid: false,
  color: '#2e6e5a',
  hardness: 0.2,
  isSolid(meta) {
    return meta?.placed === true;
  },
  canPlaceOnTop: true,
  tick: createLeafDecayTick('pine_leaves')
};
