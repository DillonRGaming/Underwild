import { BlockItem, Item } from './blockItem.js';
import apple from './apple.js';
import wooden_shovel from './wooden_shovel.js';
import wooden_pickaxe from './wooden_pickaxe.js';
import wooden_axe from './wooden_axe.js';
import wooden_sword from './wooden_sword.js';
import trowel from './trowel.js';
import copper_pickaxe from './copper_pickaxe.js';
import copper_axe from './copper_axe.js';
import copper_shovel from './copper_shovel.js';
import copper_sword from './copper_sword.js';
import iron_pickaxe from './iron_pickaxe.js';
import iron_axe from './iron_axe.js';
import iron_shovel from './iron_shovel.js';
import iron_sword from './iron_sword.js';
import gold_pickaxe from './gold_pickaxe.js';
import gold_axe from './gold_axe.js';
import gold_shovel from './gold_shovel.js';
import gold_sword from './gold_sword.js';
import diamond_pickaxe from './diamond_pickaxe.js';
import diamond_axe from './diamond_axe.js';
import diamond_shovel from './diamond_shovel.js';
import diamond_sword from './diamond_sword.js';
import coal from './coal.js';
import iron_ingot from './iron_ingot.js';
import gold_ingot from './gold_ingot.js';
import diamond from './diamond.js';

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

export function registerAllItems(registry) {
  [
    apple,
    wooden_shovel,
    wooden_pickaxe,
    wooden_axe,
    wooden_sword,
    trowel,
    copper_pickaxe,
    copper_axe,
    copper_shovel,
    copper_sword,
    iron_pickaxe,
    iron_axe,
    iron_shovel,
    iron_sword,
    gold_pickaxe,
    gold_axe,
    gold_shovel,
    gold_sword,
    diamond_pickaxe,
    diamond_axe,
    diamond_shovel,
    diamond_sword,
    coal,
    iron_ingot,
    gold_ingot,
    diamond
  ].forEach(item => registry.register(item));
}
