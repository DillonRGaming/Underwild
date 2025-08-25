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
  begin(world, x, y, creativeMode = false, heldItem = null) {
    const id = world.getBlockId(x, y);
    if (id === 'air') {
      this.cancel();
      return;
    }
    if (!this.state.active || this.state.x !== x || this.state.y !== y) {
      this.state.active = true;
      this.state.x = x;
      this.state.y = y;
      this.state.id = id;
      this.state.progress = 0;
      this.state.shards = makeShards();
      this.state.heldItem = heldItem;
      if (creativeMode) {
        this.state.progress = 1;
      }
    }
  }
  cancel() {
    this.state.active = false;
    this.state.progress = 0;
  }
  update(world, dt) {
    if (!this.state.active) return null;
    const type = this.registry.get(world.getBlockId(this.state.x, this.state.y)) || this.registry.get(this.state.id);
    if (!type) {
      this.cancel();
      return null;
    }
    const hardness = Math.max(0.1, Math.min(9999, type.hardness ?? 1));
    if (hardness >= 9999) {
      this.cancel();
      return null;
    }
    let speedMultiplier = 1;
    if (this.state.heldItem && this.state.heldItem.type === 'item') {
      const itemType = this.registry.get(this.state.heldItem.itemId);
      if (itemType && itemType.type === 'tool') {
        const blockId = world.getBlockId(this.state.x, this.state.y);
        if (itemType.miningSpeed && itemType.miningSpeed[blockId]) {
          speedMultiplier = itemType.miningSpeed[blockId];
        }
        else if (itemType.toolType !== 'sword' && itemType.effectiveAgainst && itemType.effectiveAgainst.includes(blockId)) {
          speedMultiplier = (itemType.baseSpeedMultiplier || 1) * (itemType.materialMultiplier || 1);
        }
      }
    }
    const rate = speedMultiplier / (hardness * 0.8);
    this.state.progress += dt * rate;
    if (this.state.progress >= 1) {
      const cell = world.getCell(this.state.x, this.state.y);
      const result = { id: cell.id, meta: cell.meta, x: this.state.x, y: this.state.y };
      const type = this.registry.get(cell.id);
      if (type && type.onBreak) {
        type.onBreak(world, this.state.x, this.state.y, cell.meta);
      }
      const aboveX = this.state.x;
      const aboveY = this.state.y - 1;
      if (world.inBounds(aboveX, aboveY)) {
        const aboveId = world.getBlockId(aboveX, aboveY);
        const aboveType = this.registry.get(aboveId);
        if (aboveType && (aboveType.id === 'poppy' || aboveType.id === 'short_grass' || aboveType.id === 'fern' || aboveType.id === 'flower_short_grass')) {
          world.setBlock(aboveX, aboveY, 'air', null);
        }
      }
      world.setBlock(this.state.x, this.state.y, 'air', null);
      world.updateLighting(this.state.x, this.state.y);
      this.cancel();
      return result;
    }
    return null;
  }
  getState() {
    return this.state;
  }
}
