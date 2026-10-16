import { gameClock } from './gameClock.js';
import { migrateLegacyId } from './legacyIds.js';

export class WorldSerializer {
  static FORMAT = 'underwild-world';
  static VERSION = 2;

  static encode(world, player, items, inventory, worldMeta) {
    const blocks = ['air'];
    const blockIndexMap = new Map([['air', 0]]);

    function getBlockIndex(id) {
      let idx = blockIndexMap.get(id);
      if (idx === undefined) {
        idx = blocks.length;
        blocks.push(id);
        blockIndexMap.set(id, idx);
      }
      return idx;
    }

    const chunks = {};
    const chunkMeta = {};
    for (const [cx, cells] of world.getAllModifiedChunks()) {
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

    const itemEntities = (items || []).concat(world.getAllSavedEntities()).map(it => ({
      blockId: it.blockId || it.itemId || null,
      x: it.x,
      y: it.y,
      vx: it.vx || 0,
      vy: it.vy || 0,
      life: it.life || 0,
      age: it.age || 0,
      count: it.count || 1
    }));

    return {
      format: WorldSerializer.FORMAT,
      version: WorldSerializer.VERSION,
      meta: {
        displayName: worldMeta?.displayName || 'World',
        seed: world.seed || 0,
        gameMode: worldMeta?.gameMode || 'survival',
        worldType: world.worldType || 'regular',
        width: world.width,
        height: world.height,
        creativeMode: worldMeta?.creativeMode || false
      },
      world: {
        seed: world.seed || 0,
        worldType: world.worldType || 'regular',
        superflatLayers: world.superflatLayers || null,
        gameMode: worldMeta?.gameMode || 'survival',
        creativeMode: worldMeta?.creativeMode || false,
        cheatsEnabled: !!world.cheatsEnabled,
        allowCommands: !!world.allowCommands,
        difficulty: world.difficulty || 'normal',
        time: world.time || 0,
        clock: gameClock.now(),
        timeManuallySet: !!world.timeManuallySet,
        currentSeed: worldMeta?.currentSeed ?? world.seed ?? 0,
        chunkSize: world.chunkSize,
        width: world.width,
        height: world.height
      },
      blocks: {
        blockDict: blocks,
        chunks,
        chunkMeta
      },
      player: playerData,
      inventory: inventory ? inventory.serialize() : null,
      itemEntities,
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
    const chunks = data.blocks.chunks;
    const chunkMeta = data.blocks.chunkMeta || {};

    const chunkData = new Map();
    for (const [cxStr, indices] of Object.entries(chunks)) {
      const cx = parseInt(cxStr, 10);
      const metas = chunkMeta[cxStr] || [];
      const cells = indices.map((idx, i) => ({
        id: migrateLegacyId(blocks[idx]) || 'air',
        meta: metas[i] || null
      }));
      chunkData.set(cx, cells);
    }

    for (const chest of data.chestData || []) {
      const cx = Math.floor(chest.x / worldMeta.chunkSize);
      const cells = chunkData.get(cx);
      const idx = chest.y * worldMeta.chunkSize + (chest.x - cx * worldMeta.chunkSize);
      const cell = cells?.[idx];
      if (cell && cell.id.endsWith('_chest') && !cell.meta?.inv) {
        cell.meta = { ...(cell.meta || {}), inv: chest.inv };
      }
    }

    return {
      worldWidth: worldMeta.width,
      worldHeight: worldMeta.height,
      chunkSize: worldMeta.chunkSize,
      worldMeta,
      chunkData,
      playerData: data.player || {},
      inventoryData: data.inventory || null,
      itemEntities: data.itemEntities || [],
      mpPlayers: data.mpPlayers || {}
    };
  }
}
