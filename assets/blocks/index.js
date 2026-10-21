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
import grassyMud from './grassy_mud.js';
import clay from './clay.js';
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
import seagrass from './seagrass.js';
import shell from './shell.js';
import poppy from './poppy.js';
import fern from './fern.js';
import flowerShortGrass from './flower_short_grass.js';
import mapleLog from './maple_log.js';
import mapleGreenLeaves from './maple_green_leaves.js';
import mapleOrangeLeaves from './maple_orange_leaves.js';
import mapleRedLeaves from './maple_red_leaves.js';
import maplePlanks from './maple_planks.js';
import mapleStairs from './maple_stairs.js';
import torch from './torch.js';
import coalOre from './coal_ore.js';
import coalOreRich from './coal_ore_rich.js';
import coalBlock from './coal_block.js';
import copperOre from './copper_ore.js';
import steelOre from './steel_ore.js';
import goldOre from './gold_ore.js';
import steelBlock from './steel_block.js';
import goldBlock from './gold_block.js';
import craftingTable from './crafting_table.js';
import bedrock from './bedrock.js';
import lunarRock from './lunar_rock.js';
import lunarRockDecor from './lunar_rock_decor.js';
import lunarPebble from './lunar_pebble.js';
import lunarRockSlab from './lunar_rock_slab.js';
import lunarRockStairs from './lunar_rock_stairs.js';
import marsSandstone from './mars_sandstone.js';
import marsSmoothSandstone from './mars_smooth_sandstone.js';
import marsCutSandstone from './mars_cut_sandstone.js';
import marsChiseledSandstone from './mars_chiseled_sandstone.js';
import marsSandstoneSlab from './mars_sandstone_slab.js';
import marsSandstoneStairs from './mars_sandstone_stairs.js';
import marsSand from './mars_sand.js';
import marsRippledSand from './mars_rippled_sand.js';
import marsRockDecor from './mars_rock_decor.js';
import marsPebble from './mars_pebble.js';
import oakChest from './oak_chest.js';
import birchChest from './birch_chest.js';
import spruceChest from './spruce_chest.js';
import pineChest from './pine_chest.js';
import mapleChest from './maple_chest.js';
import furnace from './furnace.js';
import forgingTable from './forging_table.js';
import stonePebbles from './stone_pebbles.js';
import polishedStone from './polished_stone.js';
import glass from './glass.js';
import cactus from './cactus.js';
import stoneGravel from './stone_gravel.js';
import stoneBricks from './stone_bricks.js';
import stoneSlab from './stone_slab.js';
import stoneStairs from './stone_stairs.js';
import dirtSlab from './dirt_slab.js';
import dirtStairs from './dirt_stairs.js';
import mudSlab from './mud_slab.js';
import mudStairs from './mud_stairs.js';
import grassSlab from './grass_slab.js';
import grassStairs from './grass_stairs.js';
import doubleSlab from './double_slab.js';
import { oakTrapdoor, birchTrapdoor, spruceTrapdoor, pineTrapdoor, mapleTrapdoor } from './trapdoor.js';
import explosive, { explosive1, explosive2, explosive3 } from './explosive.js';
import ladder from './ladder.js';
import redTorch from './red_torch.js';
import greenTorch from './green_torch.js';
import blueTorch from './blue_torch.js';
import purpleTorch from './purple_torch.js';
import cyanTorch from './cyan_torch.js';

import sandTypes from './sand_types.js';
import { useGrassRegistry } from './grassSpread.js';

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
    clay,
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
    seagrass,
    shell,
    poppy,
    fern,
    flowerShortGrass,
    mapleLog,
    mapleGreenLeaves,
    mapleOrangeLeaves,
    mapleRedLeaves,
    maplePlanks,
    mapleStairs,
    torch,
    coalOre,
    coalOreRich,
    coalBlock,
    copperOre,
    steelOre,
    goldOre,
    steelBlock,
    goldBlock,
    craftingTable,
    bedrock,
    oakChest,
    birchChest,
    spruceChest,
    pineChest,
    mapleChest,
    furnace,
    forgingTable,
    stonePebbles,
    polishedStone,
    glass,
    cactus,
    stoneGravel,
    stoneBricks,
    stoneSlab,
    stoneStairs,
    dirtSlab,
    dirtStairs,
    mudSlab,
    mudStairs,
    grassyMud,
    grassSlab,
    grassStairs,
    doubleSlab,
    oakTrapdoor,
    birchTrapdoor,
    spruceTrapdoor,
    pineTrapdoor,
    mapleTrapdoor,
    explosive,
    explosive1,
    explosive2,
    explosive3,
    ladder,
    redTorch,
    greenTorch,
    blueTorch,
    purpleTorch,
    cyanTorch,
    lunarRock,
    // Old names for the Moon's blocks, kept so older worlds still load (hidden from menus).
    { ...lunarRock, id: 'lunarstone', hidden: true, drop: 'lunar_rock', recipes: [] },
    lunarRockDecor,
    lunarPebble,
    { ...lunarPebble, id: 'lunarstone_pebble', hidden: true, drop: 'lunar_pebble', recipes: [] },
    lunarRockSlab,
    { ...lunarRockSlab, id: 'lunarstone_slab', hidden: true, drop: 'lunar_rock_slab', recipes: [] },
    lunarRockStairs,
    { ...lunarRockStairs, id: 'lunarstone_stairs', hidden: true, drop: 'lunar_rock_stairs', recipes: [] },
    marsSandstone,
    marsSmoothSandstone,
    marsCutSandstone,
    marsChiseledSandstone,
    marsSandstoneSlab,
    marsSandstoneStairs,
    marsSand,
    marsRippledSand,
    marsRockDecor,
    marsPebble
  ].forEach((b) => registry.register(b));
  sandTypes.forEach((b) => registry.register(b));
  useGrassRegistry(registry);
}
