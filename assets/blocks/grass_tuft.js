import { plant } from './plant.js';

export default {
  id: 'grass_tuft',
  displayName: 'Grass Tuft',
  material: 'plant',
  kind: 'plant',
  tab: 'nature',
  biomeTint: true, // green pixels take the local biome's grass colour
  shape: 'full',
  solid: false,
  color: '#5f9a40',
  hardness: 0.1,
  ...plant({ growsOn: ['land'], windSway: 1 })
};
