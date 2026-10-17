import { createFallingSand } from './sand.js';

function sandstone(id, displayName, color) {
  return { id, displayName, shape: 'full', solid: true, color, hardness: 2.5, isSolid(meta) { return meta?.layer !== 'bg'; } };
}

export const LOOSE_SAND_IDS = ['sand', 'wet_sand', 'rippled_sand', 'cracked_sand', 'red_sand', 'red_rippled_sand'];
export const SANDSTONE_IDS = [
  'sandstone', 'smooth_sandstone', 'cut_sandstone', 'chiseled_sandstone',
  'red_sandstone', 'red_smooth_sandstone', 'red_cut_sandstone', 'red_chiseled_sandstone'
];

export default [
  createFallingSand('wet_sand', 'Wet Sand', '#b8955c'),
  createFallingSand('rippled_sand', 'Rippled Sand', '#e8b46a'),
  createFallingSand('cracked_sand', 'Cracked Sand', '#e2b06a'),
  createFallingSand('red_sand', 'Red Sand', '#d27a32'),
  createFallingSand('red_rippled_sand', 'Red Rippled Sand', '#c96e2a'),
  sandstone('sandstone', 'Sandstone', '#e6b46c'),
  sandstone('smooth_sandstone', 'Smooth Sandstone', '#eabb74'),
  sandstone('cut_sandstone', 'Cut Sandstone', '#e8b872'),
  sandstone('chiseled_sandstone', 'Chiseled Sandstone', '#e4b46e'),
  sandstone('red_sandstone', 'Red Sandstone', '#cc7230'),
  sandstone('red_smooth_sandstone', 'Red Smooth Sandstone', '#d27a34'),
  sandstone('red_cut_sandstone', 'Red Cut Sandstone', '#cf7632'),
  sandstone('red_chiseled_sandstone', 'Red Chiseled Sandstone', '#c86e2c')
];
