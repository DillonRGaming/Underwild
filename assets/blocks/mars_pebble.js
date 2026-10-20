import { rockMeta } from '../../src/logic/biomes.js';
import { plant } from './plant.js';

export default {
  id: 'mars_pebble',
  displayName: 'Martian Pebbles',
  material: 'plant',
  kind: 'plant',
  isRock: true,
  tab: 'nature',
  placeMeta: () => rockMeta(Math.random(), Math.random(), Math.random()),
  shape: 'full',
  solid: false,
  color: '#b64e22',
  hardness: 0.3,
  ...plant({ growsOn: ['mars', 'mars_sand', 'mars_sandstone', 'stone'] })
};
