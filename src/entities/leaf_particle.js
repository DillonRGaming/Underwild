import { wind, exposureAt } from '../core/wind.js';

const LEAF_WIND = 1.2; // px a tick a leaf is carried at wind strength 1
const AIR_LIMIT = 600; // ticks (10 s) a leaf may fall before it fades away
const FADE_TICKS = 45; // how long the fade takes

export class LeafParticle {
  constructor(blockId, x, y, worldTime, tintFactor) {
    this.blockId = blockId;
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = -0.05 - Math.random() * 0.05;
    this.ax = (Math.random() - 0.5) * 0.01;
    this.width = 6 + Math.random() * 6;
    this.height = 6 + Math.random() * 6;
    this.life = 0;
    this.restTime = 180 + Math.random() * 240; // ticks on the ground before fading
    this.tintFactor = tintFactor || 1;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.02;
    this.createdTime = worldTime;
    this.onGround = false;
    this.alpha = 1;
    this.phase = Math.random() * Math.PI * 2; // where it is in its side-to-side flutter
    this.flutter = 0.07 + Math.random() * 0.06; // how fast it flutters
    this.light = 0.7 + Math.random() * 0.6; // lighter leaves are pushed about more
  }

  update(worldTime, world) {
    this.life += 1;

    if (!this.onGround) {
      this.vy += 0.005;
      // Pushed along by the wind in surges, tumbling and swinging from side to side as it goes,
      // and lifted by its gusts. In calm air it still drifts down with a gentle flutter.
      const tx = Math.floor(this.x / 16);
      const raw = wind.velocityAt(tx) * exposureAt(world, tx, Math.floor(this.y / 16));
      // Gentle wind barely moves a leaf; the push builds up quickly as it gets stronger.
      const w = Math.sign(raw) * Math.abs(raw) ** 1.8;
      const force = Math.abs(w);
      this.phase += this.flutter * (1 + force * 1.5);
      const swing = Math.sin(this.phase);
      this.vx += (w * LEAF_WIND * this.light * (1 + 0.35 * swing) - this.vx) * 0.04;
      this.vx += swing * (0.012 + force * 0.03);
      this.vy -= force * 0.006 * this.light * (0.5 + 0.5 * Math.cos(this.phase * 0.7));
      this.vy += Math.cos(this.phase) * 0.006 * (1 + force);
      this.rotationSpeed += (w * 0.05 * this.light + swing * 0.02 - this.rotationSpeed) * 0.05;
    } else if (this.landed && Math.abs(wind.velocityAt(Math.floor(this.x / 16)) * exposureAt(world, Math.floor(this.x / 16), Math.floor(this.y / 16))) > 0.5 && Math.random() < 0.004) {
      // A strong gust lifts a resting leaf back into the air.
      this.onGround = false;
      this.landed = false;
      this.groundTime = 0;
      this.y -= 1;
      this.vy = -0.5 - Math.random() * 0.4;
    }

    this.vx *= 0.985;
    this.vy *= 0.985;

    this.vx += this.ax;
    this.x += this.vx;
    this.y += this.vy;

    this.rotation += this.rotationSpeed;

    if (this.y > world.height * 16) {
      return true;
    }

    // Falling for over 10 s (600 ticks) without landing: fade out in the air.
    if (!this.onGround && this.life > AIR_LIMIT) this.fading = true;

    // Check just under the leaf's bottom edge, so a landed leaf stays landed.
    const tileX = Math.floor(this.x / 16);
    const foot = this.foot ?? this.height / 2;
    const tileY = Math.floor((this.y + foot + 0.5) / 16);

    if (world.inBounds(tileX, tileY)) {
      const blockType = world.getBlockType(tileX, tileY);
      // A standing trunk isn't something a leaf lands on: it slips past, down to the ground.
      const standingTrunk = blockType?.trunk && world.getCell(tileX, tileY)?.meta?.axis !== 'x';
      if (blockType && blockType.solid && !standingTrunk) {
        this.onGround = true;
        this.vy = 0;
        if (!this.landed) {
          this.landed = true;
          this.vx *= 0.1;
          this.rotationSpeed *= 0.1;
        }
        this.x += this.vx;
        this.y = tileY * 16 - foot;

        // Rest on the ground for a while, then fade.
        this.groundTime = (this.groundTime || 0) + 1;
        if (this.groundTime > this.restTime) this.fading = true;

        this.vx *= 0.8;
        this.ax = 0;
      } else {
        this.onGround = false;
      }
    } else {
      this.onGround = false;
    }

    if (this.fading) {
      this.alpha = Math.max(0, this.alpha - 1 / FADE_TICKS);
      if (this.alpha <= 0) return true;
    }
    return false;
  }
}
