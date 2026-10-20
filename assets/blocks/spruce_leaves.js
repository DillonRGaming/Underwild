import { createLeafDecayTick } from './leafDecay.js';

export default {
  id: 'spruce_leaves',
  displayName: 'Spruce Leaves',
  material: 'spruce',
  kind: 'leaves',
  tab: 'nature',
  leaves: {
    decay: [0.4, 5.5], // seconds an unattached leaf waits before falling away (null = never)
    fallOnBreak: [1, 2], // falling-leaf particles when broken (min, max)
    fallOnPlace: 0.35, // chance of a falling leaf when placed
    fallOnDecay: 1, // falling-leaf particles when it decays
    idleFall: 0.002, // chance per check that it drops a leaf on its own
    particleColor: '#3a9a3a' // falling-leaf colour when there's no texture
  },
  shape: 'full',
  solid: false,
  color: '#44aa44',
  hardness: 0.2,
  isSolid(meta) {
    return meta?.placed === true;
  },
  canPlaceOnTop: true,
  tick: createLeafDecayTick()
};
