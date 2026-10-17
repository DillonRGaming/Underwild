import { createChest } from './chest.js';

export default {
  ...createChest('pine_chest', 'Pine Chest', '#4a3528'),
  recipes: [
    { shape: ['ppp', 'p p', 'ppp'], ingredients: { p: 'pine_planks' }, count: 1 }
  ]
};
