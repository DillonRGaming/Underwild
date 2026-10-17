import { plant } from './plant.js';

export default {
  id: 'poppy',
  displayName: 'Poppy',
  material: 'plant',
  kind: 'plant',
  tab: 'nature',
  shape: 'full',
  solid: false,
  color: '#ff6b6b',
  hardness: 0.1,
  ...plant({ growsOn: ['land'], windSway: 1 })
};
