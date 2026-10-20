import { createChest } from './chest.js';

export default {
  ...createChest('spruce_chest', 'Spruce Chest', '#6b4e2c'),
  recipes: [{ shape: ['ppp', 'p p', 'ppp'], ingredients: { p: 'spruce_planks' }, count: 1 }]
};
