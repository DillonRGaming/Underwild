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
    this.maxLife = 300 + Math.random() * 300;
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
      this.vy += 0.02;
    }
    
    this.vx *= 0.97;
    this.vy *= 0.97;
    
    this.vx += this.ax;
    this.x += this.vx;
    this.y += this.vy;
    
    this.rotation += this.rotationSpeed;
    
    if (this.y > world.height * 16) {
      return true;
    }
    
    if (this.life > this.maxLife) {
      return true;
    }
    
    const tileX = Math.floor(this.x / 16);
    const tileY = Math.floor(this.y / 16);
    
    if (world.inBounds(tileX, tileY)) {
      const blockType = world.getBlockType(tileX, tileY);
      if (blockType && blockType.solid && (blockType.id === 'oak_log' || blockType.id === 'birch_log' || blockType.id === 'spruce_log' || blockType.id === 'maple_log')) {
        this.onGround = false;
      } else if (blockType && blockType.solid) {
        this.onGround = true;
        this.vy = 0;
        this.vx *= 0.05;
        this.rotationSpeed *= 0.05;
        this.x += this.vx;
        this.y = tileY * 16 - 0.1;

        this.alpha = Math.max(0, 1 - (this.life - this.maxLife * 0.6) / (this.maxLife * 0.4));

        if (Math.random() < 0.02) {
          this.ax = (Math.random() - 0.5) * 0.01;
        }
        
        if (this.life > this.maxLife && this.alpha <= 0) {
          return true;
        }
      } else {
        this.onGround = false;
      }
    } else {
      this.onGround = false;
    }
    
    return false;
  }
}
