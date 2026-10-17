import { plant } from './plant.js';

export default {
  id: 'bush',
  displayName: 'Bush',
  material: 'plant',
  kind: 'plant',
  tab: 'nature',
  variants: { count: 4, key: 'size' }, // looks: textures bush_1..bush_4, picked by meta.size
  biomeTint: true, // green pixels take the local biome's grass colour
  shape: 'full',
  solid: false,
  color: '#4a8034',
  hardness: 0.1,
  ...plant({ growsOn: ['land'], windSway: 0.45 })
};
