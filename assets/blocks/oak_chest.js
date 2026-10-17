import { createChest } from './chest.js';

export default {
  ...createChest('oak_chest', 'Oak Chest', '#9b7c4f'),
  recipes: [
    { shape: ['ppp', 'p p', 'ppp'], ingredients: { p: 'oak_planks' }, count: 1 }
  ]
};
