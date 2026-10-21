import { createChest } from './chest.js';

export default {
  ...createChest('maple_chest', 'Maple Chest'),
  recipes: [{ shape: ['ppp', 'p p', 'ppp'], ingredients: { p: 'maple_planks' }, count: 1 }]
};
