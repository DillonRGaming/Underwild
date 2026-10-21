import { rockMeta } from '../../src/logic/biomes.js';
import { plant } from './plant.js';

export default {
  id: 'rock',
  displayName: 'Rock',
  material: 'plant',
  kind: 'plant',
  isRock: true,
  tab: 'nature',
  placeMeta: () => rockMeta(Math.random(), Math.random(), Math.random()), // random size, spot and facing when placed
  shape: 'full',
  solid: false,
  hardness: 0.3,
  ...plant({ growsOn: ['land', 'beach', 'moon', 'lunar_rock', 'stone'] })
};
