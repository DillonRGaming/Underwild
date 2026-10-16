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

// Plants pop off anything but these (see each plant's tick).
const PLANTS = new Set(['short_grass', 'poppy', 'fern', 'flower_short_grass', 'bush', 'grass_tuft', 'rock', 'pebble']);
const PLANT_SOIL = new Set(['grass', 'dirt', 'coarse_dirt', 'mud', 'sand']);

export class Placer {
  constructor(registry) {
    this.registry = registry;
  }
  place(world, item, tileX, tileY, { mouseWorldX, mouseWorldY, modifierFlip, rotate, facing = 1, background = false, hasWall = false, anywhere = false, replace = false }) {
    if (!world.inBounds(tileX, tileY)) return false;
    let existing = world.getBlockId(tileX, tileY);
    const existingCell = world.getCell(tileX, tileY);
    const type = this.registry.get(item.blockId);
    if (!type) return false;
    // A background block sits behind whatever is in front: put one behind a torch, plant...
    const existingType = this.registry.get(existing);
    if (background && existing !== 'air' && existing !== 'water' && existingType && !existingType.solid && type.solid && existingCell.meta?.layer !== 'bg' && !existingCell.meta?.bgId) {
      world.setBlock(tileX, tileY, existing, { ...(existingCell.meta || {}), bgId: type.id });
      return true;
    }
    // Something placed in front of a background block keeps it behind (see World.setBlock).
    let behind = null;
    if (!background && existingCell.meta?.layer === 'bg') { behind = existing; existing = 'air'; }
    // Placing into water pushes the water aside (World.setBlock / the water sim handle it).
    if (existing === 'water') existing = 'air';
    const isNatureBlock = existing === 'short_grass' || existing === 'poppy' || existing === 'fern' || existing === 'flower_short_grass' || existing === 'bush' || existing === 'grass_tuft' || existing === 'rock' || existing === 'pebble';
    if (existing !== 'air' && !isNatureBlock && !replace) return false;
    // Plants only grow on grass (or dirt): anywhere else they would just pop off again.
    if (PLANTS.has(type.id)) {
      const below = world.inBounds(tileX, tileY + 1) ? world.getBlockId(tileX, tileY + 1) : null;
      if (!PLANT_SOIL.has(below)) return false;
    }
    const wallBehind = hasWall || !!behind || !!existingCell.meta?.bgId;
    // Trapdoors only need to touch some block (a tree trunk, a background block...), not a solid one.
    const touching = item.blockId.endsWith('_trapdoor')
      ? [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => world.inBounds(tileX + dx, tileY + dy) && world.getBlockId(tileX + dx, tileY + dy) !== 'air')
      : hasSolidNeighbor(world, tileX, tileY);
    // A torch or ladder can also hang on the wall behind it.
    const hangs = wallBehind && (type.shape === 'torch' || type.id === 'ladder');
    if (!touching && !isNatureBlock && !background && !hangs && !anywhere) return false;
    let meta = null;
    if (type.shape === 'slab') {
      const localY = mouseWorldY - tileY * TILE_SIZE;
      const top = localY < TILE_SIZE / 2;
      meta = { slabPos: modifierFlip ? (top ? 'bottom' : 'top') : (top ? 'top' : 'bottom') };
      // Trapdoors hinge on the side behind you and always swing open that way.
      if (type.id.endsWith('_trapdoor')) meta.hinge = facing < 0 ? 'right' : 'left';
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
      // Hung on the wall behind it.
      else if (!wallBehind && !anywhere) return false;
    } else if (type.id === 'ladder') {
      const solid = (x, y) => world.inBounds(x, y) && world.isSolidAt(x, y);
      const preferLeft = mouseWorldX - tileX * TILE_SIZE < TILE_SIZE / 2;
      const left = solid(tileX - 1, tileY);
      const right = solid(tileX + 1, tileY);
      if (left && (preferLeft || !right)) meta = { wall: 'left' };
      else if (right) meta = { wall: 'right' };
      else if (wallBehind || anywhere) meta = { wall: preferLeft ? 'left' : 'right' };
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
    if (behind) meta = { ...(meta || {}), bgId: behind };
    const displaced = world.getBlockId(tileX, tileY) === 'water' ? world.water?.mass?.(tileX, tileY) ?? 0 : 0;
    // Plants, torches... let water through: it stays in the cell with them.
    if (displaced > 0 && (!type.solid || background)) meta = { ...(meta || {}), water: displaced };
    world.setBlock(tileX, tileY, type.id, meta);
    if (displaced > 0 && type.solid && !background) world.water?.displace?.(tileX, tileY, displaced);
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
