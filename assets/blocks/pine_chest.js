import { createChest } from './chest.js';

export default {
  ...createChest('pine_chest', 'Pine Chest'),
  recipes: [{ shape: ['ppp', 'p p', 'ppp'], ingredients: { p: 'pine_planks' }, count: 1 }]
};
