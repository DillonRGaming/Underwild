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
  begin(world, x, y, creativeMode = false) {
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
    const rate = 1 / (hardness * 0.8);
    this.state.progress += dt * rate;
    if (this.state.progress >= 1) {
      const cell = world.getCell(this.state.x, this.state.y);
      const result = { id: cell.id, meta: cell.meta, x: this.state.x, y: this.state.y };
      
      const type = this.registry.get(cell.id);
      if (type && type.onBreak) {
        type.onBreak(world, this.state.x, this.state.y, cell.meta);
      }
      
    // Check block above to see if it needs to break as well (for plants)
      const aboveX = this.state.x;
      const aboveY = this.state.y - 1;
      if (world.inBounds(aboveX, aboveY)) {
        const aboveId = world.getBlockId(aboveX, aboveY);
        const aboveType = this.registry.get(aboveId);
        if (aboveType && (aboveType.id === 'poppy' || aboveType.id === 'short_grass' || aboveType.id === 'fern')) {
          world.setBlock(aboveX, aboveY, 'air', null);
        }
      }
      
      // Remove the block and return full break result so caller can spawn drops
      world.setBlock(this.state.x, this.state.y, 'air', null);
      // Update lighting around the removed block
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
