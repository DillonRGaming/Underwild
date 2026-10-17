import { plant } from './plant.js';

// Grows on lakebeds; dies if the sand under it goes.
export default {
  id: 'seagrass',
  displayName: 'Seagrass',
  material: 'plant',
  kind: 'plant',
  tab: 'nature',
  variants: { count: 3, key: 'v' }, // looks: textures seagrass_1..3, picked by meta.v
  shape: 'full',
  solid: false,
  color: '#2e8042',
  hardness: 0.1,
  ...plant({ growsOn: ['lakebed'], windSway: 0.6 })
};
