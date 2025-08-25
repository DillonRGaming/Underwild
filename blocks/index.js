// File: blocks/index.js
import air from './air.js';
import stone from './stone.js';
import dirt from './dirt.js';
import grass from './grass.js';
import copper from './copper.js';
import copperExposed from './copper_exposed.js';
import copperWeathered from './copper_weathered.js';
import copperOxidized from './copper_oxidized.js';
import oakLog from './oak_log.js';
import oakLeaves from './oak_leaves.js';
import oakPlanks from './oak_planks.js';
import birchPlanks from './birch_planks.js';
import sprucePlanks from './spruce_planks.js';
import sand from './sand.js';
import water from './water.js';
import mud from './mud.js';
import coarseDirt from './coarse_dirt.js';
import birchLog from './birch_log.js';
import birchLeaves from './birch_leaves.js';
import spruceLog from './spruce_log.js';
import spruceLeaves from './spruce_leaves.js';
import oakStairs from './oak_stairs.js';
import birchStairs from './birch_stairs.js';
import spruceStairs from './spruce_stairs.js';
import shortGrass from './short_grass.js';
import poppy from './poppy.js';
import fern from './fern.js';
import flowerShortGrass from './flower_short_grass.js';
import mapleLog from './maple_log.js';
import mapleGreenLeaves from './maple_green_leaves.js';
import mapleOrangeLeaves from './maple_orange_leaves.js';
import mapleRedLeaves from './maple_red_leaves.js';
import maplePlanks from './maple_planks.js';
import mapleStairs from './maple_stairs.js';
import glass from './glass.js';
import torch from './torch.js';
import coalOre from './coal_ore.js';
import ironOre from './iron_ore.js';
import goldOre from './gold_ore.js';
import diamondOre from './diamond_ore.js';

export function registerAllBlocks(registry) {
  [
    air,
    stone,
    dirt,
    grass,
    copper,
    copperExposed,
    copperWeathered,
    copperOxidized,
    oakLog,
    oakLeaves,
    oakPlanks,
    birchPlanks,
    sprucePlanks,
    sand,
    water,
    mud,
    coarseDirt,
    birchLog,
    birchLeaves,
    spruceLog,
    spruceLeaves,
    oakStairs,
    birchStairs,
    spruceStairs,
    shortGrass,
    poppy,
    fern,
    flowerShortGrass,
    mapleLog,
    mapleGreenLeaves,
    mapleOrangeLeaves,
    mapleRedLeaves,
    maplePlanks,
    mapleStairs,
    glass,
    torch,
    coalOre,
    ironOre,
    goldOre,
    diamondOre
  ].forEach(b => registry.register(b));
}
