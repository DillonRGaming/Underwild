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
  }

  update(worldTime, world) {
    this.life += 1;
    
    if (!this.onGround) {
      this.vy += 0.005;
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
      if (blockType && blockType.solid) {
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
