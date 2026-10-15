import { createLeafDecayTick } from './leafDecay.js';

export default {
  id: 'spruce_leaves',
  displayName: 'Spruce Leaves',
  shape: 'full',
  solid: false,
  color: '#44aa44',
  hardness: 0.2,
  isSolid(meta) {
    return meta?.placed === true;
  },
  canPlaceOnTop: true,
  tick: createLeafDecayTick('spruce_leaves')
};
