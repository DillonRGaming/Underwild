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
  has(id) {
    return this.map.has(id);
  }
  entries() {
    return this.map.entries();
  }
  isItem(id) {
    return !!this.map.get(id)?.isItem;
  }
  isBlock(id) {
    const def = this.map.get(id);
    return !!def && !def.isItem;
  }
  *blocks() {
    for (const [id, def] of this.map) {
      if (!def.isItem) yield [id, def];
    }
  }
  *items() {
    for (const [id, def] of this.map) {
      if (def.isItem) yield [id, def];
    }
  }
}
