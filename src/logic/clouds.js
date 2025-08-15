import { TILE_SIZE } from '../core/utils.js';

function rand(min, max) { return Math.random() * (max - min) + min; }
function randi(min, max) { return Math.floor(rand(min, max + 1)); }

export class Clouds {
  constructor(world) {
    this.world = world;
    this.list = [];
    this.spawnInitial();
  }
  spawnInitial() {
    const W = this.world.width * TILE_SIZE;
    const count = Math.max(32, Math.floor(this.world.width / 4));
    for (let i = 0; i < count; i++) {
      this.list.push(this.makeCloud(rand(0, W)));
    }
  }
  makeCloud(x) {
    const y = rand(TILE_SIZE * 1, TILE_SIZE * 3);
    const partsCount = randi(8, 15);
    const parts = [];
    let width = 0;
    for (let i = 0; i < partsCount; i++) {
      const size = rand(25, 50);
      const rx = size;
      const ry = size * rand(0.8, 1.2);
      const dx = (i === 0) ? 0 : rand(-20, 20) + width;
      const dy = rand(-15, 15);
      width += rx * 0.95;
      parts.push({ dx, dy, rx, ry });
    }
    const alpha = rand(0.16, 0.26);
    const speed = rand(3, 10);
    return { x, y, alpha, parts, speed };
  }
  update(dt) {
    const W = this.world.width * TILE_SIZE;
    for (const c of this.list) {
      c.x += c.speed * dt;
      if (c.x > W + 300) c.x = -300;
    }
  }
}
