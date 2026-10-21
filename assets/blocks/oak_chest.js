import { createChest } from './chest.js';

export default {
  ...createChest('oak_chest', 'Oak Chest'),
  recipes: [{ shape: ['ppp', 'p p', 'ppp'], ingredients: { p: 'oak_planks' }, count: 1 }]
};
