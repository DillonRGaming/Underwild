import { gameClock } from './gameClock.js';
import { migrateLegacyId } from './legacyIds.js';
import { wind } from './wind.js';
import { weather } from './weather.js';

// World files. The top level describes Earth (the world you start in): its seed, type, chunks
// and items. Every other dimension (the Moon, Mars...) is kept under `dimensions`, each with its
// own chunks, items and time. All chunks share one block dictionary (`blocks.blockDict`).
//
// Older files also kept a copy of every dimension (Earth included) under `dimensions`, and the
// top level held whichever dimension you saved in; decode() reads both layouts.

// What an item entity is saved as.
const savedItem = (it) => ({
  blockId: it.blockId || it.itemId || null,
  x: it.x,
  y: it.y,
  vx: it.vx || 0,
  vy: it.vy || 0,
  life: it.life || 0,
  age: it.age || 0,
  count: it.count || 1
});

export class WorldSerializer {
  static FORMAT = 'underwild-world';
  static VERSION = 3;

  // Loaded chunks' water lives in each world's water sim; it's saved as water in its blocks, so
  // every loaded dimension's water is written into its cells while encoding (then taken out).
  static encode(world, player, items, inventory, worldMeta) {
    const worlds = world.dimensionManager ? [...world.dimensionManager.dimensions.values()] : [world];
    const deposit = (i) => {
      if (i >= worlds.length) return WorldSerializer.encodeCells(world, player, items, inventory, worldMeta);
      const water = worlds[i]?.water;
      return water?.hasWater() ? water.withDeposited(() => deposit(i + 1)) : deposit(i + 1);
    };
    return deposit(0);
  }

  static encodeCells(world, player, items, inventory, worldMeta) {
    const blocks = ['air'];
    const blockIndexMap = new Map([['air', 0]]);
    const getBlockIndex = (id) => {
      let idx = blockIndexMap.get(id);
      if (idx === undefined) {
        idx = blocks.length;
        blocks.push(id);
        blockIndexMap.set(id, idx);
      }
      return idx;
    };

    // chunkX -> cells, as { chunks, chunkMeta } in the file's block dictionary.
    const encodeChunks = (chunkMap) => {
      const chunks = {};
      const chunkMeta = {};
      for (const [cx, cells] of chunkMap) {
        const indices = new Array(cells.length);
        const metas = new Array(cells.length);
        let hasMeta = false;
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          indices[i] = getBlockIndex(cell?.id || 'air');
          metas[i] = cell?.meta ?? null;
          if (metas[i] !== null) hasMeta = true;
        }
        chunks[cx] = indices;
        if (hasMeta) chunkMeta[cx] = metas;
      }
      return { chunks, chunkMeta };
    };

    const manager = world.dimensionManager;
    const earth = manager?.dimensions.get('earth') || world;
    // The player's own item list belongs to the world they're in; the others carry theirs.
    const itemsOf = (w) => (w === world ? items || [] : w.items || []).concat(w.getAllSavedEntities()).map(savedItem);

    const earthData = encodeChunks(earth.getAllModifiedChunks());
    const dimensions = {};
    if (manager) {
      for (const [dimId, dimWorld] of manager.dimensions) {
        if (dimWorld === earth) continue;
        const { chunks, chunkMeta } = encodeChunks(dimWorld.getAllModifiedChunks());
        dimensions[dimId] = {
          worldType: dimWorld.worldType,
          seed: dimWorld.seed,
          time: dimWorld.time || 0,
          chunks,
          chunkMeta,
          itemEntities: itemsOf(dimWorld)
        };
      }
      // Dimensions not visited this session keep what was loaded from the file (re-encoded,
      // since this file's block dictionary is a new one).
      for (const [dimId, saved] of manager.savedDimensionsData || []) {
        if (dimId === 'earth' || dimId === 'overworld' || dimensions[dimId] || manager.dimensions.has(dimId)) continue;
        const { chunks, chunkMeta } = encodeChunks(saved.chunkData || new Map());
        dimensions[dimId] = {
          worldType: saved.worldType,
          seed: saved.seed,
          time: saved.time ?? earth.time ?? 0,
          chunks,
          chunkMeta,
          itemEntities: saved.itemEntities || []
        };
      }
    }

    const playerData = {
      x: player?.x ?? 0,
      y: player?.y ?? 0,
      health: player?.health ?? 20,
      maxHealth: player?.maxHealth ?? 20,
      hunger: player?.hunger ?? 20,
      maxHunger: player?.maxHunger ?? 20,
      creativeFlying: player?.creativeFlying || false,
      isFlying: player?.isFlying || false,
      selectedIndex: worldMeta?.selectedIndex ?? 0
    };

    return {
      format: WorldSerializer.FORMAT,
      version: WorldSerializer.VERSION,
      activeDimension: world.dimensionId || 'earth',
      dimensions,
      meta: {
        displayName: worldMeta?.displayName || 'World',
        seed: earth.seed || 0,
        gameMode: worldMeta?.gameMode || 'survival',
        worldType: earth.worldType || 'regular',
        width: earth.width,
        height: earth.height,
        creativeMode: worldMeta?.creativeMode || false
      },
      world: {
        seed: earth.seed || 0,
        worldType: earth.worldType || 'regular',
        superflatLayers: earth.superflatLayers || null,
        gameMode: worldMeta?.gameMode || 'survival',
        creativeMode: worldMeta?.creativeMode || false,
        cheatsEnabled: !!world.cheatsEnabled,
        allowCommands: !!world.allowCommands,
        difficulty: world.difficulty || 'normal',
        time: earth.time || 0,
        clock: gameClock.now(),
        timeManuallySet: !!world.timeManuallySet,
        wind: wind.speed,
        weather: weather.type,
        weatherAuto: weather.auto,
        snowCover: weather.snowCover,
        currentSeed: worldMeta?.currentSeed ?? earth.seed ?? 0,
        chunkSize: earth.chunkSize,
        width: earth.width,
        height: earth.height
      },
      blocks: {
        blockDict: blocks,
        chunks: earthData.chunks,
        chunkMeta: earthData.chunkMeta
      },
      player: playerData,
      inventory: inventory ? inventory.serialize() : null,
      itemEntities: itemsOf(earth),
      // Multiplayer guests' inventories and positions, by player name.
      mpPlayers: world.mpPlayers || {}
    };
  }

  static decode(data) {
    if (!data || data.format !== WorldSerializer.FORMAT || !data.world || !data.blocks) {
      throw new Error('Invalid world file');
    }

    const worldMeta = data.world;
    const blocks = data.blocks.blockDict;
    const decodeChunks = (chunks = {}, chunkMeta = {}) => {
      const map = new Map();
      for (const [cxStr, indices] of Object.entries(chunks)) {
        const metas = chunkMeta[cxStr] || [];
        map.set(
          parseInt(cxStr, 10),
          indices.map((idx, i) => ({
            id: migrateLegacyId(blocks[idx]) || 'air',
            meta: metas[i] || null
          }))
        );
      }
      return map;
    };

    const dims = data.dimensions || {};
    const oldEarth = dims.earth || dims.overworld;
    const activeDimension = data.activeDimension === 'overworld' ? 'earth' : data.activeDimension || 'earth';
    // Files before version 3 kept Earth's own copy under dimensions.earth, and the top level
    // held whichever dimension was active (not always Earth).
    const legacy = (data.version || 0) < 3 && oldEarth?.chunks;
    const chunkData = legacy ? decodeChunks(oldEarth.chunks, oldEarth.chunkMeta) : decodeChunks(data.blocks.chunks, data.blocks.chunkMeta);

    for (const chest of data.chestData || []) {
      const cx = Math.floor(chest.x / worldMeta.chunkSize);
      const cells = chunkData.get(cx);
      const idx = chest.y * worldMeta.chunkSize + (chest.x - cx * worldMeta.chunkSize);
      const cell = cells?.[idx];
      if (cell && cell.id.endsWith('_chest') && !cell.meta?.inv) {
        cell.meta = { ...(cell.meta || {}), inv: chest.inv };
      }
    }

    // The other dimensions (Earth isn't one of them).
    const dimensionsData = new Map();
    for (const [dimId, dimData] of Object.entries(dims)) {
      if (dimId === 'earth' || dimId === 'overworld') continue;
      dimensionsData.set(dimId, {
        worldType: dimData.worldType,
        seed: dimData.seed,
        time: dimData.time,
        chunkData: decodeChunks(dimData.chunks, dimData.chunkMeta),
        itemEntities: dimData.itemEntities || []
      });
    }

    // Old files saved in another dimension: the top-level seed, type and time were that
    // dimension's, so Earth's come from its own entry.
    const earthMeta =
      legacy && activeDimension !== 'earth' ? { ...worldMeta, seed: oldEarth.seed ?? worldMeta.seed, worldType: oldEarth.worldType || 'regular' } : worldMeta;

    return {
      worldWidth: worldMeta.width,
      worldHeight: worldMeta.height,
      chunkSize: worldMeta.chunkSize,
      worldMeta: earthMeta,
      chunkData,
      activeDimension,
      dimensionsData,
      playerData: data.player || {},
      inventoryData: data.inventory || null,
      itemEntities: legacy ? oldEarth.itemEntities || [] : data.itemEntities || [],
      mpPlayers: data.mpPlayers || {}
    };
  }
}
