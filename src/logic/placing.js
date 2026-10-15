import { TILE_SIZE } from '../core/utils.js';
import { BUSH_SIZES, rockMeta } from './biomes.js';

function hasSolidNeighbor(world, x, y) {
  const n = [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1]
  ];
  for (const [tx, ty] of n) {
    if (!world.inBounds(tx, ty)) continue;
    if (world.isSolidAt(tx, ty)) return true;
  }
  return false;
}

export class Placer {
  constructor(registry) {
    this.registry = registry;
  }
  place(world, item, tileX, tileY, { mouseWorldX, mouseWorldY, modifierFlip, rotate, background = false }) {
    if (!world.inBounds(tileX, tileY)) return false;
    const existing = world.getBlockId(tileX, tileY);
    const isNatureBlock = existing === 'short_grass' || existing === 'poppy' || existing === 'fern' || existing === 'flower_short_grass' || existing === 'bush' || existing === 'grass_tuft' || existing === 'rock' || existing === 'pebble';
    if (existing !== 'air' && !isNatureBlock) return false;
    const type = this.registry.get(item.blockId);
    if (!type) return false;
    if (!hasSolidNeighbor(world, tileX, tileY) && !isNatureBlock && !background) return false;
    let meta = null;
    if (type.shape === 'slab') {
      const localY = mouseWorldY - tileY * TILE_SIZE;
      const top = localY < TILE_SIZE / 2;
      meta = { slabPos: modifierFlip ? (top ? 'bottom' : 'top') : (top ? 'top' : 'bottom') };
    } else if (type.shape === 'stairs') {
      const localX = mouseWorldX - tileX * TILE_SIZE;
      let orient = 'right';
      if (localX < TILE_SIZE / 2) orient = 'left';
      if (rotate !== modifierFlip) orient = orient === 'right' ? 'left' : 'right';
      meta = { orient };
    } else if (type.shape === 'torch') {
      const solid = (x, y) => world.inBounds(x, y) && world.isSolidAt(x, y);
      if (solid(tileX, tileY + 1)) meta = null;
      else if (solid(tileX - 1, tileY)) meta = { wall: 'left' };
      else if (solid(tileX + 1, tileY)) meta = { wall: 'right' };
      else return false;
    } else if (type.id === 'ladder') {
      const solid = (x, y) => world.inBounds(x, y) && world.isSolidAt(x, y);
      const preferLeft = mouseWorldX - tileX * TILE_SIZE < TILE_SIZE / 2;
      const left = solid(tileX - 1, tileY);
      const right = solid(tileX + 1, tileY);
      if (left && (preferLeft || !right)) meta = { wall: 'left' };
      else if (right) meta = { wall: 'right' };
      else return false;
      background = false;
    } else if (item.blockId.endsWith('_chest')) {
      meta = { inv: Array.from({ length: 27 }, () => null) };
    } else if (item.blockId.endsWith('_leaves')) {
      meta = { placed: true };
    } else if (type.id === 'bush') {
      meta = { size: 1 + Math.floor(Math.random() * BUSH_SIZES) };
    } else if (type.id === 'rock' || type.id === 'pebble') {
      meta = rockMeta(Math.random(), Math.random(), Math.random());
    }
    if (background) meta = { ...(meta || {}), layer: 'bg' };
    world.setBlock(tileX, tileY, type.id, meta);
    if (type.onPlace) type.onPlace(world, tileX, tileY, meta);

    const belowX = tileX;
    const belowY = tileY + 1;
    if (world.inBounds(belowX, belowY)) {
      const belowId = world.getBlockId(belowX, belowY);
      // Only solid blocks smother grass; plants, rocks and other decorations don't.
      if (belowId === 'grass' && type.solid) {
        const belowCell = world.getCell(belowX, belowY);
        if (!belowCell.meta) belowCell.meta = {};
        belowCell.meta.turnToDirt = true;
        belowCell.meta.dirtTimer = 0;
      }
    }
    return true;
  }
}
