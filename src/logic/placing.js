import { TILE_SIZE } from '../core/utils.js';

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
  place(world, item, tileX, tileY, { mouseWorldX, mouseWorldY, modifierFlip, rotate }) {
    if (!world.inBounds(tileX, tileY)) return false;
    const existing = world.getBlockId(tileX, tileY);
    if (existing !== 'air') return false;
    const type = this.registry.get(item.blockId);
    if (!type) return false;
    if (!hasSolidNeighbor(world, tileX, tileY)) return false;
    let meta = null;
    if (type.shape === 'slab') {
      const localY = mouseWorldY - tileY * TILE_SIZE;
      const top = localY < TILE_SIZE / 2;
      meta = { slabPos: modifierFlip ? (top ? 'bottom' : 'top') : (top ? 'top' : 'bottom') };
    } else if (type.shape === 'stairs') {
      const localX = mouseWorldX - tileX * TILE_SIZE;
      let orient = localX >= TILE_SIZE / 2 ? 'right' : 'left';
      if (rotate) orient = (orient === 'right') ? 'left' : 'right';
      meta = { orient };
    } else if (item.blockId === 'chest') {
      meta = { inv: Array.from({ length: 27 }, () => null) };
    }
    world.setBlock(tileX, tileY, type.id, meta);
    if (type.onPlace) type.onPlace(world, tileX, tileY, meta);
    return true;
  }
}
