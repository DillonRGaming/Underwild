import { createChest } from './chest.js';

export default {
  ...createChest('spruce_chest', 'Spruce Chest'),
  recipes: [{ shape: ['ppp', 'p p', 'ppp'], ingredients: { p: 'spruce_planks' }, count: 1 }]
};
