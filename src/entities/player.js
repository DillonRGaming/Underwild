import { TILE_SIZE } from '../core/utils.js';
import { resolvePlayerPhysics } from '../core/physics.js';

export class Player {
  constructor(world, registry, x, y) {
    this.world = world;
    this.registry = registry;
    this.x = x;
    this.y = y;
    this.width = Math.floor(0.8 * TILE_SIZE);
    this.height = Math.floor(1.8 * TILE_SIZE);
    this.vx = 0;
    this.vy = 0;
    this.maxSpeed = 220;
    this.jumpVelocity = 265;
    this.gravity = 950;
    this.maxFallSpeed = 800;
    this.onGround = false;
  }
  update(input, dt, time, noClipMode = false) {
    const textInputMode = typeof window !== 'undefined' && window.textInputMode;
    if (textInputMode) {
      this.vx = 0;
      this.vy = 0;
      return;
    }
    resolvePlayerPhysics(this, this.world, input, dt, noClipMode);
  }
  getHeadAnchor() {
    return { x: this.x + this.width / 2, y: this.y + Math.max(6, this.height * 0.25) };
  }
}
