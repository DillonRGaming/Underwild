import { plant } from './plant.js';

export default {
  id: 'short_grass',
  displayName: 'Short Grass',
  material: 'plant',
  kind: 'plant',
  tab: 'nature',
  biomeTint: true, // green pixels take the local biome's grass colour
  shape: 'full',
  solid: false,
  color: '#7cb342',
  hardness: 0.1,
  ...plant({ growsOn: ['land'], windSway: 1 })
};
