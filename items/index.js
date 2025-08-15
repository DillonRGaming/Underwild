import { BlockItem, Item } from './blockItem.js';

export function defaultHotbar(registry) {
  return [
    new BlockItem('stone'),
    new BlockItem('dirt'),
    new BlockItem('grass'),
    new BlockItem('sand'),
    new BlockItem('log'),
    new BlockItem('leaves'),
    new BlockItem('planks'),
    new BlockItem('stone_slab'),
    new BlockItem('stone_stairs')
  ];
}
