export class BlockRegistry {
  constructor() {
    this.map = new Map();
  }
  register(block) {
    this.map.set(block.id, block);
  }
  get(id) {
    return this.map.get(id);
  }
  entries() {
    return this.map.entries();
  }
}
