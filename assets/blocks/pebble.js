import { rockMeta } from '../../src/logic/biomes.js';
import { plant } from './plant.js';

export default {
  id: 'pebble',
  displayName: 'Pebble',
  material: 'plant',
  kind: 'plant',
  tab: 'nature',
  placeMeta: () => rockMeta(Math.random(), Math.random(), Math.random()), // random size, spot and facing when placed
  shape: 'full',
  solid: false,
  color: '#9a9894',
  hardness: 0.3,
  ...plant({ growsOn: ['land', 'beach'] })
};
