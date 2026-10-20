import { rockMeta } from '../../src/logic/biomes.js';
import { plant } from './plant.js';

export default {
  id: 'lunar_pebble',
  displayName: 'Lunar Pebble',
  material: 'plant',
  kind: 'plant',
  isRock: true,
  tab: 'nature',
  placeMeta: () => rockMeta(Math.random(), Math.random(), Math.random()),
  shape: 'full',
  solid: false,
  color: '#acafb4',
  hardness: 0.3,
  ...plant({ growsOn: ['moon', 'lunar_rock', 'stone', 'land', 'beach'] })
};
