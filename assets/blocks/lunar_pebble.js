import { rockMeta } from '../../src/logic/biomes.js';
import { plant } from './plant.js';

const block = {
  id: 'lunar_pebble',
  displayName: 'Lunar Pebble',
  material: 'plant',
  kind: 'plant',
  isRock: true,
  tab: 'nature',
  placeMeta: () => rockMeta(Math.random(), Math.random(), Math.random()),
  shape: 'full',
  solid: false,
  hardness: 0.3,
  ...plant({ growsOn: ['moon', 'lunar_rock', 'stone', 'land', 'beach'] })
};

// Its old name, kept so older worlds still load (hidden from menus).
export default [block, { ...block, id: 'lunarstone_pebble', hidden: true, drop: 'lunar_pebble', recipes: [] }];
