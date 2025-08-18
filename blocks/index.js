// File: blocks/index.js
import air from './air.js';
import bedrock from './bedrock.js';
import stone from './stone.js';
import dirt from './dirt.js';
import grass from './grass.js';
import stoneSlab from './stone_slab.js';
import stoneStairs from './stone_stairs.js';
import copper from './copper.js';
import copperExposed from './copper_exposed.js';
import copperWeathered from './copper_weathered.js';
import copperOxidized from './copper_oxidized.js';
import chest from './chest.js';
import oakLog from './oak_log.js';
import oakLeaves from './oak_leaves.js';
import trapdoor from './trapdoor.js';
import oakPlanks from './oak_planks.js';
import birchPlanks from './birch_planks.js';
import sprucePlanks from './spruce_planks.js';
import craftingTable from './crafting_table.js';
import sand from './sand.js';
import water from './water.js';
import mud from './mud.js';
import coarseDirt from './coarse_dirt.js';
import gravel from './gravel.js';
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
import mapleLog from './maple_log.js';
import mapleGreenLeaves from './maple_green_leaves.js';
import mapleOrangeLeaves from './maple_orange_leaves.js';
import mapleRedLeaves from './maple_red_leaves.js';
import maplePlanks from './maple_planks.js';
import mapleStairs from './maple_stairs.js';
import glass from './glass.js';

export function registerAllBlocks(registry) {
  [
    air,
    bedrock,
    stone,
    dirt,
    grass,
    stoneSlab,
    stoneStairs,
    copper,
    copperExposed,
    copperWeathered,
    copperOxidized,
    chest,
    oakLog,
    oakLeaves,
    trapdoor,
    oakPlanks,
    birchPlanks,
    sprucePlanks,
    craftingTable,
    sand,
    water,
    mud,
    coarseDirt,
    gravel,
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
    mapleLog,
    mapleGreenLeaves,
    mapleOrangeLeaves,
    mapleRedLeaves,
    maplePlanks,
    mapleStairs,
    glass
  ].forEach(b => registry.register(b));
}
