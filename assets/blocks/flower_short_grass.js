import { plant } from './plant.js';

export default {
  id: 'flower_short_grass',
  displayName: 'Flower Short Grass',
  material: 'plant',
  kind: 'plant',
  tab: 'nature',
  biomeTint: true, // green pixels take the local biome's grass colour
  shape: 'full',
  solid: false,
  color: '#8bc34a',
  hardness: 0.1,
  ...plant({ growsOn: ['land'], windSway: 1 })
};
