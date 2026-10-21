import { plant } from './plant.js';

// A small beach shell; meta.v (1-3) picks the look.
export default {
  id: 'shell',
  displayName: 'Shell',
  material: 'plant',
  kind: 'plant',
  tab: 'nature',
  variants: { count: 3, key: 'v' }, // looks: textures shell_1..3, picked by meta.v
  shape: 'full',
  solid: false,
  hardness: 0.1,
  ...plant({ growsOn: ['lakebed', 'land'] })
};
