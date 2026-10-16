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
import pinePlanks from './pine_planks.js';
import sand from './sand.js';
import water from './water.js';
import mud from './mud.js';
import coarseDirt from './coarse_dirt.js';
import birchLog from './birch_log.js';
import birchLeaves from './birch_leaves.js';
import spruceLog from './spruce_log.js';
import birchLogBase from './birch_log_base.js';
import pineLog from './pine_log.js';
import spruceLeaves from './spruce_leaves.js';
import pineLeaves from './pine_leaves.js';
import oakStairs from './oak_stairs.js';
import birchStairs from './birch_stairs.js';
import spruceStairs from './spruce_stairs.js';
import pineStairs from './pine_stairs.js';
import shortGrass from './short_grass.js';
import bush from './bush.js';
import grassTuft from './grass_tuft.js';
import rock from './rock.js';
import dirtPath from './dirt_path.js';
import pebble from './pebble.js';
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
import copperOre from './copper_ore.js';
import steelOre from './steel_ore.js';
import goldOre from './gold_ore.js';
import steelBlock from './steel_block.js';
import goldBlock from './gold_block.js';
import craftingTable from './crafting_table.js';
import bedrock from './bedrock.js';
import gravel from './gravel.js';
import oakChest from './oak_chest.js';
import birchChest from './birch_chest.js';
import spruceChest from './spruce_chest.js';
import pineChest from './pine_chest.js';
import mapleChest from './maple_chest.js';
import furnace from './furnace.js';
import forgingTable from './forging_table.js';
import stoneSlab from './stone_slab.js';
import stoneStairs from './stone_stairs.js';
import trapdoor from './trapdoor.js';
import explosive from './explosive.js';
import ladder from './ladder.js';
import redTorch from './red_torch.js';
import greenTorch from './green_torch.js';
import blueTorch from './blue_torch.js';
import purpleTorch from './purple_torch.js';
import cyanTorch from './cyan_torch.js';

import sandTypes from './sand_types.js';

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
    pinePlanks,
    sand,
    water,
    mud,
    coarseDirt,
    birchLog,
    birchLeaves,
    spruceLog,
    birchLogBase,
    pineLog,
    spruceLeaves,
    pineLeaves,
    oakStairs,
    birchStairs,
    spruceStairs,
    pineStairs,
    shortGrass,
    bush,
    grassTuft,
    rock,
    dirtPath,
    pebble,
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
    copperOre,
    steelOre,
    goldOre,
    steelBlock,
    goldBlock,
    craftingTable,
    bedrock,
    gravel,
    oakChest,
    birchChest,
    spruceChest,
    pineChest,
    mapleChest,
    furnace,
    forgingTable,
    stoneSlab,
    stoneStairs,
    trapdoor,
    explosive,
    ladder,
    redTorch,
    greenTorch,
    blueTorch,
    purpleTorch,
    cyanTorch
  ].forEach(b => registry.register(b));
  sandTypes.forEach(b => registry.register(b));
}
