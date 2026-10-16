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
import steel_pickaxe from './steel_pickaxe.js';
import steel_axe from './steel_axe.js';
import steel_shovel from './steel_shovel.js';
import steel_sword from './steel_sword.js';
import gold_pickaxe from './gold_pickaxe.js';
import gold_axe from './gold_axe.js';
import gold_shovel from './gold_shovel.js';
import gold_sword from './gold_sword.js';
import coal from './coal.js';
import raw_copper from './raw_copper.js';
import copper_ingot from './copper_ingot.js';
import copper_rod from './copper_rod.js';
import raw_steel from './raw_steel.js';
import steel_ingot from './steel_ingot.js';
import steel_rod from './steel_rod.js';
import raw_gold from './raw_gold.js';
import gold_ingot from './gold_ingot.js';
import gold_rod from './gold_rod.js';
import stick from './stick.js';

import copper_ingot_heated from './copper_ingot_heated.js';
import copper_pickaxe_head from './copper_pickaxe_head.js';
import copper_pickaxe_head_heated from './copper_pickaxe_head_heated.js';
import copper_axe_head from './copper_axe_head.js';
import copper_axe_head_heated from './copper_axe_head_heated.js';
import copper_shovel_head from './copper_shovel_head.js';
import copper_shovel_head_heated from './copper_shovel_head_heated.js';
import copper_sword_head from './copper_sword_head.js';
import copper_sword_head_heated from './copper_sword_head_heated.js';
import steel_ingot_heated from './steel_ingot_heated.js';
import steel_pickaxe_head from './steel_pickaxe_head.js';
import steel_pickaxe_head_heated from './steel_pickaxe_head_heated.js';
import steel_axe_head from './steel_axe_head.js';
import steel_axe_head_heated from './steel_axe_head_heated.js';
import steel_shovel_head from './steel_shovel_head.js';
import steel_shovel_head_heated from './steel_shovel_head_heated.js';
import steel_sword_head from './steel_sword_head.js';
import steel_sword_head_heated from './steel_sword_head_heated.js';
import gold_ingot_heated from './gold_ingot_heated.js';
import gold_pickaxe_head from './gold_pickaxe_head.js';
import gold_pickaxe_head_heated from './gold_pickaxe_head_heated.js';
import gold_axe_head from './gold_axe_head.js';
import gold_axe_head_heated from './gold_axe_head_heated.js';
import gold_shovel_head from './gold_shovel_head.js';
import gold_shovel_head_heated from './gold_shovel_head_heated.js';
import gold_sword_head from './gold_sword_head.js';
import gold_sword_head_heated from './gold_sword_head_heated.js';
import blacksmith_hammer from './blacksmith_hammer.js';
import bucket from './bucket.js';
import water_bucket from './water_bucket.js';
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
    steel_pickaxe,
    steel_axe,
    steel_shovel,
    steel_sword,
    gold_pickaxe,
    gold_axe,
    gold_shovel,
    gold_sword,
    coal,
    raw_copper,
    copper_ingot,
    copper_rod,
    raw_steel,
    steel_ingot,
    steel_rod,
    raw_gold,
    gold_ingot,
    gold_rod,
    stick,
    copper_ingot_heated,
    copper_pickaxe_head,
    copper_pickaxe_head_heated,
    copper_axe_head,
    copper_axe_head_heated,
    copper_shovel_head,
    copper_shovel_head_heated,
    copper_sword_head,
    copper_sword_head_heated,
    steel_ingot_heated,
    steel_pickaxe_head,
    steel_pickaxe_head_heated,
    steel_axe_head,
    steel_axe_head_heated,
    steel_shovel_head,
    steel_shovel_head_heated,
    steel_sword_head,
    steel_sword_head_heated,
    gold_ingot_heated,
    gold_pickaxe_head,
    gold_pickaxe_head_heated,
    gold_axe_head,
    gold_axe_head_heated,
    gold_shovel_head,
    gold_shovel_head_heated,
    gold_sword_head,
    gold_sword_head_heated,
    blacksmith_hammer,
    bucket,
    water_bucket
  ].forEach(item => registry.register({ ...item, isItem: true }));
}
