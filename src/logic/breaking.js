import { TILE_SIZE } from '../core/utils.js';

function makeShards() {
  const shards = [];
  const n = 4;
  const s = TILE_SIZE / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      shards.push({ x: Math.floor(i * s), y: Math.floor(j * s), w: Math.ceil(s), h: Math.ceil(s) });
    }
  }
  return shards;
}


export class Breaker {
  constructor(registry) {
    this.registry = registry;
    this.state = { active: false, progress: 0, x: 0, y: 0, id: null, shards: makeShards() };
  }
  // wallId: mining an empty cell digs out the wall or background block behind it (dirt, stone, sand...).
  begin(world, x, y, creativeMode = false, heldItem = null, wallId = null) {
    let id = world.getBlockId(x, y);
    const cell = world.getCell(x, y);
    const wall = wallId || (cell.meta?.layer === 'bg' ? id : cell.meta?.bgId || null);
    if (wall) id = wall;
    // Water can't be mined directly, but walls behind it can.
    if (!wall && (id === 'air' || id === 'water')) {
      this.cancel();
      return;
    }
    if (!this.state.active || this.state.x !== x || this.state.y !== y || this.state.wall !== wall) {
      this.state.wall = wall;
      this.state.active = true;
      this.state.x = x;
      this.state.y = y;
      this.state.id = id;
      this.state.progress = 0;
      this.state.shards = makeShards();
    }
    this.state.heldItem = heldItem;
    this.state.creative = creativeMode;
    if (creativeMode) {
      this.state.progress = 1;
    }
  }
  cancel() {
    this.state.active = false;
    this.state.progress = 0;
  }
  update(world, dt) {
    if (!this.state.active) return null;
    const type = this.registry.get(this.state.wall || world.getBlockId(this.state.x, this.state.y)) || this.registry.get(this.state.id);
    if (!type) {
      this.cancel();
      return null;
    }
    const hardness = Math.max(0.1, type.hardness ?? 1);
    if (!Number.isFinite(hardness) && !this.state.creative) {
      this.cancel();
      return null;
    }
    let speedMultiplier = 1;
    if (this.state.heldItem && this.state.heldItem.type === 'item') {
      const itemType = this.registry.get(this.state.heldItem.itemId);
      if (itemType && itemType.type === 'tool') {
        const blockId = this.state.wall || world.getBlockId(this.state.x, this.state.y);
        if (itemType.miningSpeed && itemType.miningSpeed[blockId]) {
          speedMultiplier = itemType.miningSpeed[blockId];
        }
        // A block names the tool that mines it fastest (tool: 'pickaxe'); a tool can also
        // list extra block ids in effectiveAgainst.
        else if (itemType.toolType !== 'sword' && (this.registry.get(blockId)?.tool === itemType.toolType || itemType.effectiveAgainst?.includes(blockId))) {
          speedMultiplier = (itemType.baseSpeedMultiplier || 1) * (itemType.materialMultiplier || 1);
        }
      }
    }
    if (!this.state.creative) {
      const rate = (speedMultiplier * 1.5) / (hardness * 0.5);
      this.state.progress += dt * rate;
    }
    if (this.state.progress >= 1 && this.state.wall) {
      const { x, y, wall } = this.state;
      this.cancel();
      const cell = world.getCell(x, y);
      if (cell.meta?.bgId) {
        const meta = { ...cell.meta };
        delete meta.bgId;
        world.setBlock(x, y, cell.id, meta);
      } else if (cell.meta?.layer === 'bg') {
        world.setBlock(x, y, 'air', null);
      } else {
        world.setBlock(x, y, cell.id === 'air' ? 'air' : cell.id, { ...(cell.meta || {}), noWall: true });
      }
      return { id: wall, drop: this.registry.get(wall)?.drop ?? wall, meta: null, x, y, extraDrops: [] };
    }
    if (this.state.progress >= 1) {
      const x = this.state.x;
      const y = this.state.y;
      const cell = world.getCell(x, y);
      const brokenType = this.registry.get(cell.id);
      if (brokenType && brokenType.onBreak) {
        brokenType.onBreak(world, x, y, cell.meta);
      }
      const result = { id: cell.id, drop: brokenType?.drop ?? cell.id, dropCount: brokenType?.dropCount ?? 1, meta: cell.meta, x, y, extraDrops: [] };
      // A double slab comes apart into its two slabs.
      if (cell.id === 'double_slab' && cell.meta?.bottom) {
        // Grass grown over a dirt double slab comes off on its top half.
        const grown = this.registry.get(cell.meta.top)?.growsGrass;
        const top = cell.meta.grassy && grown ? grown : cell.meta.top;
        result.drop = cell.meta.bottom;
        if (top) result.extraDrops.push({ id: top, x, y });
      }
      if (world.inBounds(x, y - 1)) {
        const aboveId = world.getBlockId(x, y - 1);
        const aboveType = this.registry.get(aboveId);
        const aboveMeta = world.getCell(x, y - 1).meta;
        if (aboveType && ((aboveType.needsSupport && !aboveMeta?.wall) || aboveType.plant)) {
          result.extraDrops.push({ id: aboveType.drop ?? aboveId, x, y: y - 1 });
          world.setBlock(x, y - 1, 'air', null);
        }
      }
      for (const [sx, side] of [[x - 1, 'right'], [x + 1, 'left']]) {
        if (!world.inBounds(sx, y)) continue;
        const sideCell = world.getCell(sx, y);
        if ((this.registry.get(sideCell.id)?.shape === 'torch' || this.registry.get(sideCell.id)?.climbable) && sideCell.meta?.wall === side) {
          result.extraDrops.push({ id: sideCell.id, x: sx, y });
          world.setBlock(sx, y, 'air', null);
        }
      }
      world.setBlock(x, y, 'air', null);
      this.cancel();
      return result;
    }
    return null;
  }
  getState() {
    return this.state;
  }
}
