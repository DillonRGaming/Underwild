import { TILE_SIZE } from '../core/utils.js';
import { canGrowOn } from '../../assets/blocks/plant.js';

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
  place(
    world,
    item,
    tileX,
    tileY,
    { mouseWorldX, mouseWorldY, modifierFlip, rotate, facing = 1, background = false, hasWall = false, anywhere = false, replace = false }
  ) {
    if (!world.inBounds(tileX, tileY)) return false;
    let existing = world.getBlockId(tileX, tileY);
    const existingCell = world.getCell(tileX, tileY);
    const type = this.registry.get(item.blockId);
    if (!type) return false;
    // A background block sits behind whatever is in front: put one behind a torch, plant...
    const existingType = this.registry.get(existing);
    if (
      background &&
      existing !== 'air' &&
      existing !== 'water' &&
      existingType &&
      (!existingType.solid || (existingType.shape && existingType.shape !== 'full')) &&
      type.solid &&
      existingCell.meta?.layer !== 'bg' &&
      !existingCell.meta?.bgId
    ) {
      world.setBlock(tileX, tileY, existing, { ...(existingCell.meta || {}), bgId: type.id });
      return true;
    }
    // Something placed in front of a background block keeps it behind (see World.setBlock).
    let behind = null;
    let behindMeta = null;
    if (!background) {
      if (existingCell.meta?.layer === 'bg') {
        behind = existing;
        behindMeta = existingCell.meta;
        existing = 'air';
      } else if (existingCell.meta?.bgId) {
        behind = existingCell.meta.bgId;
        behindMeta = existingCell.meta.bgMeta || { layer: 'bg' };
      }
    }
    // Placing into water pushes the water aside (World.setBlock / the water sim handle it).
    if (existing === 'water') existing = 'air';
    // Plants get replaced by whatever is put into them.
    const isNatureBlock = !!this.registry.get(existing)?.plant;
    if (existing !== 'air' && !isNatureBlock && !replace) return false;
    // A plant only goes on ground it can grow on: anywhere else it would just pop off again.
    if (type.plant && !(world.inBounds(tileX, tileY + 1) && canGrowOn(type, world.getBlockType(tileX, tileY + 1)))) return false;
    const wallBehind = hasWall || !!behind || !!existingCell.meta?.bgId;
    // Trapdoors only need to touch some block (a tree trunk, a background block...), not a solid one.
    const touching =
      type.kind === 'trapdoor'
        ? [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
          ].some(([dx, dy]) => world.inBounds(tileX + dx, tileY + dy) && world.getBlockId(tileX + dx, tileY + dy) !== 'air')
        : hasSolidNeighbor(world, tileX, tileY);
    // A background wall or block behind provides support for placing anything in front (slabs, torches, trapdoors, blocks...).
    const supported = touching || wallBehind || isNatureBlock || background || anywhere;
    if (!supported) return false;
    let meta = null;
    if (type.shape === 'slab') {
      const localY = mouseWorldY - tileY * TILE_SIZE;
      const top = localY < TILE_SIZE / 2;
      meta = { slabPos: modifierFlip ? (top ? 'bottom' : 'top') : top ? 'top' : 'bottom' };
      // Trapdoors hinge on the side of the cell that was clicked.
      if (type.kind === 'trapdoor') meta.hinge = mouseWorldX - tileX * TILE_SIZE < TILE_SIZE / 2 ? 'left' : 'right';
    } else if (type.shape === 'stairs') {
      // The corner clicked is the stair's inner corner: the left or right half picks the tall
      // side, the bottom half stands it up and the top half hangs it upside down.
      const localX = mouseWorldX - tileX * TILE_SIZE;
      const localY = mouseWorldY - tileY * TILE_SIZE;
      let orient = localX < TILE_SIZE / 2 ? 'left' : 'right';
      if (rotate) orient = orient === 'right' ? 'left' : 'right';
      let upside = localY < TILE_SIZE / 2;
      if (modifierFlip) upside = !upside;
      meta = upside ? { orient, upside: true } : { orient };
    } else if (type.shape === 'torch') {
      const solid = (x, y) => world.inBounds(x, y) && world.isSolidAt(x, y);
      if (solid(tileX, tileY + 1)) meta = null;
      else if (solid(tileX - 1, tileY)) meta = { wall: 'left' };
      else if (solid(tileX + 1, tileY)) meta = { wall: 'right' };
      // Hung on the wall behind it.
      else if (wallBehind || anywhere) meta = { wall: 'back' };
      else return false;
    } else if (type.climbable) {
      const solid = (x, y) => world.inBounds(x, y) && world.isSolidAt(x, y);
      const preferLeft = mouseWorldX - tileX * TILE_SIZE < TILE_SIZE / 2;
      const left = solid(tileX - 1, tileY);
      const right = solid(tileX + 1, tileY);
      if (left && (preferLeft || !right)) meta = { wall: 'left' };
      else if (right) meta = { wall: 'right' };
      else if (wallBehind || anywhere) meta = { wall: preferLeft ? 'left' : 'right' };
      else return false;
      background = false;
    } else if (type.leaves) {
      meta = { placed: true };
    } else if (type.variants) {
      // A random one of the block's looks.
      meta = { [type.variants.key]: 1 + Math.floor(Math.random() * type.variants.count) };
    } else if (type.placeMeta) {
      meta = type.placeMeta();
    }
    if (background) meta = { ...(meta || {}), layer: 'bg' };
    if (behind) meta = { ...(meta || {}), bgId: behind, ...(behindMeta ? { bgMeta: behindMeta } : {}) };
    // Water here stays around plants and torches; a solid block pushes it aside (the water
    // sim does both when the block changes).
    world.setBlock(tileX, tileY, type.id, meta);
    if (type.onPlace) type.onPlace(world, tileX, tileY, meta);

    const belowX = tileX;
    const belowY = tileY + 1;
    if (world.inBounds(belowX, belowY)) {
      // Only solid blocks smother grass; plants, rocks and other decorations don't.
      // A top slab leaves the grass under it in the open.
      const coversTop = !(type.shape === 'slab' && meta?.slabPos === 'top');
      if (world.getBlockType(belowX, belowY)?.grassy && type.solid && coversTop) {
        const belowCell = world.getCell(belowX, belowY);
        if (!belowCell.meta) belowCell.meta = {};
        belowCell.meta.turnToDirt = true;
        belowCell.meta.dirtTimer = 0;
      }
    }
    return true;
  }
}
