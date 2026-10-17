import { createChest } from './chest.js';

export default {
  ...createChest('birch_chest', 'Birch Chest', '#d0c39a'),
  recipes: [
    { shape: ['ppp', 'p p', 'ppp'], ingredients: { p: 'birch_planks' }, count: 1 }
  ]
};
