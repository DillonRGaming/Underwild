export class World {
  constructor(width, height, registry) {
    this.width = width;
    this.height = height;
    this.registry = registry;
    this.cells = new Array(width * height);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = { id: 'air', meta: null };
    }
    this.time = 0;
    this.dayLength = 30;
    
    this.stars = [];
    this.initializeStars();
  }
  
  initializeStars() {
    for (let i = 0; i < 200; i++) {
      this.stars.push({
        x: Math.random() * 2000,
        y: Math.random() * 1000,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.3 + 0.1,
        speed: Math.random() * 0.3 + 0.05,
        phase: Math.random() * Math.PI * 2
      });
    }
  }
  index(x, y) {
    return y * this.width + x;
  }
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
  getCell(x, y) {
    if (!this.inBounds(x, y)) return { id: 'air', meta: null };
    return this.cells[this.index(x, y)];
  }
  getBlockId(x, y) {
    return this.getCell(x, y).id;
  }
  getBlockType(x, y) {
    const id = this.getBlockId(x, y);
    return this.registry.get(id);
  }
  setBlock(x, y, id, meta = null) {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.cells[i] = { id, meta };
  }
  isSolidAt(x, y) {
    const t = this.getBlockType(x, y);
    return !!(t && t.solid);
  }
  tick(dt, time) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        const cell = this.cells[i];
        const t = this.registry.get(cell.id);
        if (t && typeof t.tick === 'function') {
          if (!cell.meta) cell.meta = {};
          t.tick(this, x, y, cell.meta, time);
        }
      }
    }
  }

  findConnected(x, y, predicate) {
    const found = [];
    const q = [{x, y}];
    const visited = new Set([this.index(x, y)]);

    while (q.length > 0) {
      const {x, y} = q.shift();
      found.push({x, y});

      const neighbors = [
        {x: x + 1, y},
        {x: x - 1, y},
        {x: x, y: y + 1},
        {x: x, y: y - 1},
      ];

      for (const n of neighbors) {
        if (this.inBounds(n.x, n.y)) {
          const idx = this.index(n.x, n.y);
          if (!visited.has(idx)) {
            visited.add(idx);
            const cell = this.getCell(n.x, n.y);
            if (predicate(cell)) {
              q.push(n);
            }
          }
        }
      }
    }
    return found;
  }
}
