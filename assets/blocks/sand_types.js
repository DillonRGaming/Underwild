import { createFallingSand } from './sand.js';

function sandstone(id, displayName) {
  return {
    id,
    displayName,
    material: id.startsWith('red_') ? 'red_sandstone' : 'sandstone',
    kind: 'block',
    tab: 'building',
    tool: 'pickaxe',
    shape: 'full',
    solid: true,
    hardness: 2.5,
    isSolid(meta) {
      return meta?.layer !== 'bg';
    }
  };
}

export default [
  createFallingSand('wet_sand', 'Wet Sand'),
  createFallingSand('rippled_sand', 'Rippled Sand'),
  createFallingSand('cracked_sand', 'Cracked Sand'),
  {
    ...createFallingSand('red_sand', 'Red Sand'),
    recipes: [{ shapeless: { red_rippled_sand: 1 }, count: 1 }]
  },
  createFallingSand('red_rippled_sand', 'Red Rippled Sand'),
  {
    ...sandstone('sandstone', 'Sandstone'),
    recipes: [{ shape: ['ss', 'ss'], ingredients: { s: 'sand' }, count: 1 }]
  },
  {
    ...sandstone('smooth_sandstone', 'Smooth Sandstone'),
    recipes: [{ shape: ['ss'], ingredients: { s: 'sandstone' }, count: 2 }]
  },
  {
    ...sandstone('cut_sandstone', 'Cut Sandstone'),
    recipes: [{ shape: ['ss', 'ss'], ingredients: { s: 'sandstone' }, count: 4 }]
  },
  {
    ...sandstone('chiseled_sandstone', 'Chiseled Sandstone'),
    recipes: [{ shape: ['s', 's'], ingredients: { s: 'cut_sandstone' }, count: 1 }]
  },
  {
    ...sandstone('red_sandstone', 'Red Sandstone'),
    recipes: [{ shape: ['ss', 'ss'], ingredients: { s: 'red_sand' }, count: 1 }]
  },
  {
    ...sandstone('red_smooth_sandstone', 'Red Smooth Sandstone'),
    recipes: [{ shape: ['ss'], ingredients: { s: 'red_sandstone' }, count: 2 }]
  },
  {
    ...sandstone('red_cut_sandstone', 'Red Cut Sandstone'),
    recipes: [{ shape: ['ss', 'ss'], ingredients: { s: 'red_sandstone' }, count: 4 }]
  },
  {
    ...sandstone('red_chiseled_sandstone', 'Red Chiseled Sandstone'),
    recipes: [{ shape: ['s', 's'], ingredients: { s: 'red_cut_sandstone' }, count: 1 }]
  }
];
