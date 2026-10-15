const GRAVITY = 0.08;
const MAX_FALL = 4;

export class PrimedExplosive {
  constructor(tileX, tileY, tileSize, fuseMs) {
    this.tileSize = tileSize;
    this.x = tileX * tileSize;
    this.y = tileY * tileSize;
    this.vy = 0;
    this.fuse = fuseMs;
    this.start = performance.now();
  }

  progress() {
    return Math.min(1, (performance.now() - this.start) / this.fuse);
  }

  update(world) {
    const size = this.tileSize;
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY);
    const nextY = this.y + this.vy;
    const tx = Math.floor((this.x + size / 2) / size);
    const below = Math.floor((nextY + size) / size);
    if (world.inBounds(tx, below) && world.getBlockType(tx, below)?.solid) {
      this.y = below * size - size;
      this.vy = 0;
    } else {
      this.y = nextY;
    }
    return this.progress() >= 1;
  }

  tile() {
    const size = this.tileSize;
    return { x: Math.floor((this.x + size / 2) / size), y: Math.floor((this.y + size / 2) / size) };
  }
}
