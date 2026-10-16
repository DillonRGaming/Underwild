import { gameClock } from '../core/gameClock.js';
const GRAVITY = 0.08;
const MAX_FALL = 4;
const AIR_DRAG = 0.985;
const GROUND_FRICTION = 0.8;

export class PrimedExplosive {
  constructor(tileX, tileY, tileSize, fuseMs) {
    this.tileSize = tileSize;
    this.x = tileX * tileSize;
    this.y = tileY * tileSize;
    this.vx = 0;
    this.vy = 0;
    this.fuse = fuseMs;
    this.start = gameClock.now();
  }

  progress() {
    return Math.min(1, (gameClock.now() - this.start) / this.fuse);
  }

  solidAt(world, px, py) {
    const tx = Math.floor(px / this.tileSize);
    const ty = Math.floor(py / this.tileSize);
    if (!world.inBounds(tx, ty)) return false;
    const cell = world.getCell(tx, ty);
    return !!world.getBlockType(tx, ty)?.solid && cell.meta?.layer !== 'bg';
  }

  update(world) {
    const size = this.tileSize;
    // Sideways (a blast can throw it): stop against walls.
    if (this.vx) {
      const nextX = this.x + this.vx;
      const edge = this.vx > 0 ? nextX + size - 0.01 : nextX;
      if (this.solidAt(world, edge, this.y + 1) || this.solidAt(world, edge, this.y + size - 1)) this.vx = 0;
      else this.x = nextX;
    }
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY);
    const nextY = this.y + this.vy;
    const left = this.x + 1;
    const right = this.x + size - 1;
    if (this.vy > 0 && (this.solidAt(world, left, nextY + size) || this.solidAt(world, right, nextY + size))) {
      this.y = Math.floor((nextY + size) / size) * size - size;
      this.vy = 0;
      this.vx *= GROUND_FRICTION;
    } else if (this.vy < 0 && (this.solidAt(world, left, nextY) || this.solidAt(world, right, nextY))) {
      this.vy = 0;
    } else {
      this.y = nextY;
    }
    this.vx *= AIR_DRAG;
    if (Math.abs(this.vx) < 0.02) this.vx = 0;
    return this.progress() >= 1;
  }

  tile() {
    const size = this.tileSize;
    return { x: Math.floor((this.x + size / 2) / size), y: Math.floor((this.y + size / 2) / size) };
  }
}
