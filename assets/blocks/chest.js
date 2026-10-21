// Slots in a single chest; a double chest has twice as many.
export const CHEST_SLOTS = 18;
const emptyInv = (n) => Array.from({ length: n }, () => null);
// Exactly n slots: the stacks kept in place, missing slots empty. (Older saves had 27 per
// chest; stacks past the end are packed into the empty slots before it where they fit.)
function fit(inv, n) {
  const out = emptyInv(n);
  const extra = [];
  (inv || []).forEach((st, i) => {
    if (!st) return;
    if (i < n) out[i] = st;
    else extra.push(st);
  });
  for (let i = 0; i < n && extra.length; i++) if (!out[i]) out[i] = extra.shift();
  // Anything still left over rides along at the end, for openChest to spill out.
  return extra.length ? [...out, ...extra] : out;
}

export const isChest = (id) => typeof id === 'string' && id.endsWith('_chest');

export const createChest = (id, displayName) => ({
  id,
  displayName,
  material: id.replace(/_chest$/, ''),
  kind: 'chest',
  tool: 'axe',
  burnTime: 7.5,
  tab: 'functional',
  outline: false, // no dark edge drawn round it
  dropsContents: true, // spills what's inside when broken
  placeMeta: () => ({ inv: Array.from({ length: CHEST_SLOTS }, () => null) }), // starts empty
  shape: 'full',
  solid: true,
  hardness: 3,
  onPlace: function (world, x, y) {
    const cell = world.getCell(x, y);
    if (!cell.meta) cell.meta = {};
    if (!cell.meta.inv) cell.meta.inv = emptyInv(CHEST_SLOTS);
    this.checkAndCombineWithAdjacent(world, x, y);
  },
  // A chest put next to a single chest of the same wood joins it: the left one holds both
  // halves' slots (its own first), the right one none.
  checkAndCombineWithAdjacent: function (world, x, y) {
    const cell = world.getCell(x, y);
    if (!cell.meta) cell.meta = {};
    const single = (c) => !c.meta?.chestType || c.meta.chestType === 'single';
    const join = (left, right) => {
      left.meta ??= {};
      right.meta ??= {};
      left.meta.chestType = 'left';
      right.meta.chestType = 'right';
      left.meta.inv = [...fit(left.meta.inv, CHEST_SLOTS), ...fit(right.meta.inv, CHEST_SLOTS)];
      right.meta.inv = null;
    };
    if (world.inBounds(x + 1, y) && world.getBlockId(x + 1, y) === this.id && single(world.getCell(x + 1, y))) return join(cell, world.getCell(x + 1, y));
    if (world.inBounds(x - 1, y) && world.getBlockId(x - 1, y) === this.id && single(world.getCell(x - 1, y))) return join(world.getCell(x - 1, y), cell);
    cell.meta.chestType = 'single';
    cell.meta.inv = fit(cell.meta.inv, CHEST_SLOTS);
  },
  // Breaking half of a double chest: the broken half takes its own slots with it (they drop,
  // see handleBrokenBlock) and the other half becomes a single chest with the rest.
  onBreak: function (world, x, y, meta) {
    if (!meta?.chestType || meta.chestType === 'single') return;
    const otherX = meta.chestType === 'left' ? x + 1 : x - 1;
    if (!world.inBounds(otherX, y) || world.getBlockId(otherX, y) !== this.id) return;
    const other = world.getCell(otherX, y);
    other.meta ??= {};
    other.meta.chestType = 'single';
    if (meta.chestType === 'left') {
      const all = fit(meta.inv, CHEST_SLOTS * 2);
      meta.inv = all.slice(0, CHEST_SLOTS);
      other.meta.inv = all.slice(CHEST_SLOTS);
    } else {
      const all = fit(other.meta.inv, CHEST_SLOTS * 2);
      other.meta.inv = all.slice(0, CHEST_SLOTS);
      meta.inv = all.slice(CHEST_SLOTS);
    }
  }
});
