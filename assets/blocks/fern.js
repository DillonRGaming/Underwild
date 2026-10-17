import { plant } from './plant.js';

export default {
  id: 'fern',
  displayName: 'Fern',
  material: 'plant',
  kind: 'plant',
  tab: 'nature',
  biomeTint: true, // green pixels take the local biome's grass colour
  shape: 'full',
  solid: false,
  color: '#5d8e4d',
  hardness: 0.1,
  ...plant({ growsOn: ['land'], windSway: 1 })
};
