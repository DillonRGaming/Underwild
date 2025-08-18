import { TILE_SIZE } from './utils.js';

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 3.0; // Increased zoom for closer view
  }
  worldToScreenX(wx) { return (wx - this.x) * this.zoom; }
  worldToScreenY(wy) { return (wy - this.y) * this.zoom; }
  screenToWorldX(sx) { return sx / this.zoom + this.x; }
  screenToWorldY(sy) { return sy / this.zoom + this.y; }
  followTo(targetX, targetY, canvas, world) {
    const viewW = canvas.width / this.zoom;
    const viewH = canvas.height / this.zoom;
    const worldW = world.width * TILE_SIZE;
    const worldH = world.height * TILE_SIZE;
    this.x = clamp(targetX - viewW / 2, 0, Math.max(0, worldW - viewW));
    this.y = clamp(targetY - viewH / 2, 0, Math.max(0, worldH - viewH));
  }
}
