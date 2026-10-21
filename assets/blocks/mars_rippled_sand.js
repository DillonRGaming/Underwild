import { createFallingSand } from './sand.js';

export default {
  ...createFallingSand('mars_rippled_sand', 'Rippled Martian Sand'),
  soil: ['mars', 'mars_sand', 'mars_sandstone', 'sand'],
  recipes: [{ shapeless: { mars_sand: 1 }, count: 1 }]
};
