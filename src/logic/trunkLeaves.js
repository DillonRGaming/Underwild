// A trunk inside a tree's crown gets a layer of leaves drawn in front of it, so the crown
// doesn't look cut in two. It's only a picture: breaking the trunk takes it too (and drops
// the leaf). Returns the leaf block id covering (x, y), or null.
export function trunkLeafCover(world, x, y) {
  const leafAt = (tx, ty) => {
    if (!world.inBounds(tx, ty)) return null;
    const cell = world.getCell(tx, ty);
    return world.getBlockType(tx, ty)?.leaves && cell.meta?.layer !== 'bg' ? cell.id : null;
  };
  const left = leafAt(x - 1, y);
  const right = leafAt(x + 1, y);
  const above = leafAt(x, y - 1);
  if (left && right) return left;
  if (above && (left || right)) return above;
  return null;
}

// The cover a trunk keeps: once it has leaves in front it remembers them (meta.leafCover),
// so breaking the leaves beside it doesn't strip the trunk bare. Only breaking the trunk
// takes them.
export function keptLeafCover(world, x, y) {
  const cell = world.getCell(x, y);
  if (cell.meta?.leafCover) return cell.meta.leafCover;
  const cover = trunkLeafCover(world, x, y);
  if (cover) {
    if (!cell.meta) cell.meta = {};
    cell.meta.leafCover = cover;
  }
  return cover;
}


