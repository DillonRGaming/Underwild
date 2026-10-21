import { spreadTick } from './grassSpread.js';

// Check if a block allows grass to be visually exposed to air/transparent block
export function isOpenAt(world, x, y, fromDx = 0, fromDy = 0) {
  if (!world.inBounds(x, y)) return false;
  const t = world.getBlockType(x, y);
  if (!t || !t.solid) return true;
  if (t.shape === 'slab') {
    const meta = world.getCell(x, y)?.meta || {};
    const pos = meta.slabPos || 'bottom';
    // If checking above (fromDy === 1), a bottom slab sits directly on top of the block, so it's NOT open!
    if (fromDy === 1 && pos === 'bottom') return false;
    // If checking below (fromDy === -1), a top slab covers the ceiling, so it's NOT open!
    if (fromDy === -1 && pos === 'top') return false;
    return true;
  }
  if (t.shape === 'stairs') {
    // Stairs are solid top and bottom; one side is full height, the other only half.
    if (fromDy !== 0) return false;
    const right = (world.getCell(x, y)?.meta?.orient || 'right') === 'right';
    return fromDx === -1 ? right : !right;
  }
  return t.shape !== 'full';
}

// Open air above, below, left or right of (x, y): somewhere grass can grow.
export function hasOpenSide(world, x, y) {
  return openSidesMask(world, x, y) !== 0;
}

export function openSidesMask(world, x, y) {
  let m = 0;
  if (isOpenAt(world, x, y - 1, 0, 1)) m |= 1; // top
  if (isOpenAt(world, x + 1, y, -1, 0)) m |= 2; // right
  if (isOpenAt(world, x, y + 1, 0, -1)) m |= 4; // bottom
  if (isOpenAt(world, x - 1, y, 1, 0)) m |= 8; // left
  // A slab's or stair's own empty part always leaves that face in the open.
  const t = world.getBlockType(x, y);
  const meta = world.getCell(x, y)?.meta || {};
  if (t?.shape === 'stairs') m |= meta.upside ? 4 : 1;
  else if (t?.shape === 'slab') m |= (meta.slabPos || 'bottom') === 'top' ? 4 : 1;
  return m;
}

export default {
  id: 'dirt',
  displayName: 'Dirt',
  material: 'dirt',
  kind: 'block',
  tab: 'nature',
  tool: 'shovel', // mined fastest with this
  growsGrass: 'grass', // grass creeping onto it turns it into this
  soil: ['land', 'lakebed'], // what plants can grow on it (see plant.js)
  shape: 'full',
  solid: true,
  hardness: 2.0,
  tick(world, x, y, meta) {
    spreadTick(world, x, y, meta, this.id);
  }
};
