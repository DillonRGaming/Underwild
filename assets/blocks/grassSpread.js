import { hasOpenSide, openSidesMask } from './dirt.js';

// Grass growth is driven by two block properties:
//   growsGrass: 'grass'        on bare soil - the block it becomes when grass creeps onto it.
//   grassy: { bare: 'dirt' }   on grass blocks - the bare block it goes back to when covered,
//                              and the soil texture drawn under its grass overlay.
// A soil whose grassy form goes back to something else (coarse dirt -> grass -> dirt) keeps
// its own id in meta.soil, so it comes back as itself.
let registry = null;
export function useGrassRegistry(r) {
  registry = r;
}
const defOf = (id) => registry?.get(id);

// The bare block a grassy cell shows / turns back into.
export function bareIdOf(id, meta) {
  return meta?.soil || defOf(id)?.grassy?.bare;
}
// A double slab of two soil slabs grows grass like a full block (meta.grassy).
const isSoilSlab = (id) => !!(defOf(id)?.growsGrass || defOf(id)?.grassy);
export const isSoilDouble = (meta) => isSoilSlab(meta?.bottom) && isSoilSlab(meta?.top);
export function isGrassyCell(cell) {
  if (!cell || cell.meta?.layer === 'bg') return false;
  if (cell.id === 'double_slab') return !!cell.meta?.grassy && isSoilDouble(cell.meta);
  return !!defOf(cell.id)?.grassy;
}
function canGrowGrass(cell) {
  if (!cell || cell.meta?.layer === 'bg') return false;
  if (cell.id === 'double_slab') return !cell.meta?.grassy && isSoilDouble(cell.meta);
  return !!defOf(cell.id)?.growsGrass;
}
// What a cell turns into once grass grows on it / dies off it.
function grownCell(cell, sides) {
  if (cell.id === 'double_slab')
    return { id: 'double_slab', meta: { bottom: cell.meta.bottom, top: cell.meta.top, grassy: true, ...(sides != null ? { sides } : {}) } };
  const grownId = defOf(cell.id).growsGrass;
  const next = { ...shapeMeta(cell.meta), ...(sides != null ? { sides } : {}) };
  if (defOf(grownId)?.grassy?.bare !== cell.id) next.soil = cell.id;
  return { id: grownId, meta: next };
}
function bareCell(cell) {
  if (cell.id === 'double_slab') return { id: 'double_slab', meta: { bottom: cell.meta.bottom, top: cell.meta.top } };
  const m = shapeMeta(cell.meta);
  return { id: bareIdOf(cell.id, cell.meta), meta: Object.keys(m).length ? m : null };
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
];

// Slab position / stair facing survive turning grassy or bare.
function shapeMeta(meta) {
  const out = {};
  if (meta?.slabPos) out.slabPos = meta.slabPos;
  if (meta?.orient) out.orient = meta.orient;
  if (meta?.upside) out.upside = true;
  return out;
}

// Bare soil: grass from any neighbour (diagonals too) creeps onto it when it has an open side.
export function spreadTick(world, x, y, meta, id) {
  const cell = { id, meta };
  if (!canGrowGrass(cell) || Math.random() >= 0.1) return;
  for (const [dx, dy] of NEIGHBORS) {
    if (!world.inBounds(x + dx, y + dy) || !isGrassyCell(world.getCell(x + dx, y + dy))) continue;
    if (!hasOpenSide(world, x, y) || Math.random() >= 0.2) return;
    const open = openSidesMask(world, x, y);
    let sides = 1;
    if (!(open & 1)) {
      if (dx < 0 && open & 8) sides = 8;
      else if (dx > 0 && open & 2) sides = 2;
      else if (open & 4) sides = 4;
      else sides = open;
    }
    const next = grownCell(cell, sides);
    world.setBlock(x, y, next.id, next.meta);
    world.updateLighting(x, y);
    return;
  }
}

// Grass: dies back to its soil when covered, otherwise creeps round its open sides one at a time.
export function grassTick(world, x, y, meta, id) {
  const bare = () => {
    const next = bareCell({ id, meta });
    world.setBlock(x, y, next.id, next.meta);
    world.updateLighting(x, y);
  };
  // Meta changed in place: the cell must be redrawn, saved and sent to the other players
  // like a setBlock would.
  const touched = () => {
    world.noteRedraw?.(x, y);
    const chunk = world.chunks?.get(world.chunkKey(world.chunkXFor(x)));
    if (chunk) chunk.dirty = true;
    world.onBlockChanged?.(x, y);
  };
  const open = openSidesMask(world, x, y);
  if (meta && (meta.turnToDirt || meta.turnToMud)) {
    // Only smothered while something still covers the top; a block taken away again in time
    // (or a top slab, which leaves the grass in the open) lets it live.
    if (open & 1) {
      delete meta.turnToDirt;
      delete meta.turnToMud;
      delete meta.dirtTimer;
    } else {
      meta.dirtTimer = (meta.dirtTimer || 0) + 1;
      if (meta.dirtTimer >= 5) return bare();
    }
  }
  if (!open) {
    if (Math.random() < 0.1) bare();
    return;
  }
  // Bits: 1 up, 2 right, 4 down, 8 left. Grass without a record of its sides (grown at world
  // generation) counts as grown on every open side.
  if (!meta) {
    world.setBlock(x, y, id, { sides: open });
    return;
  }
  if (meta.sides == null) {
    meta.sides = open;
    touched();
    return;
  }
  const before = meta.sides;
  meta.sides &= open;
  if (meta.sides !== before) touched();
  const missing = open & ~meta.sides;
  if (!missing || Math.random() >= 0.25) return;
  const canGrow = (bit) => {
    if (!(missing & bit)) return false;
    if (bit === 1) return true;
    // Round the corner from our own grass, or across from a grassy neighbour.
    if ((bit === 8 || bit === 2) && meta.sides & 5) return true;
    if (bit === 4 && meta.sides & 10) return true;
    if (bit === 8 && isGrassyCell(world.getCell(x - 1, y))) return true;
    if (bit === 2 && isGrassyCell(world.getCell(x + 1, y))) return true;
    if (bit === 4 && isGrassyCell(world.getCell(x, y + 1))) return true;
    return false;
  };
  for (const bit of [1, 8, 2, 4]) {
    if (canGrow(bit)) {
      meta.sides |= bit;
      touched();
      return;
    }
  }
}

// Runs grass growth and die-back to a standstill over freshly generated ground, so a new chunk
// shows up already settled instead of fixing itself in front of the player. Columns whose
// neighbours aren't loaded yet are left for when they are.
export function settleGrass(world, x0, x1) {
  const loaded = (x) => world.inBounds(x, 0) && world.isChunkLoaded(world.chunkXFor(x));
  const put = (x, y, id, meta) => {
    const chunk = world.chunks.get(world.chunkKey(world.chunkXFor(x)));
    const idx = y * world.chunkSize + (x - chunk.chunkX * world.chunkSize);
    chunk.cells[idx] = { id, meta };
    world._noteCellWritten?.(chunk, idx, id);
  };
  const grassyAt = (x, y) => world.inBounds(x, y) && isGrassyCell(world.getCell(x, y));
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let x = x0; x <= x1; x++) {
      if (!loaded(x) || !loaded(x - 1) || !loaded(x + 1)) continue;
      for (let y = 0; y < world.height; y++) {
        const cell = world.getCell(x, y);
        if (isGrassyCell(cell)) {
          if (hasOpenSide(world, x, y)) continue;
          const next = bareCell(cell);
          put(x, y, next.id, next.meta);
          changed = true;
        } else if (canGrowGrass(cell) && hasOpenSide(world, x, y) && NEIGHBORS.some(([dx, dy]) => grassyAt(x + dx, y + dy))) {
          const next = grownCell(cell);
          put(x, y, next.id, next.meta);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}
