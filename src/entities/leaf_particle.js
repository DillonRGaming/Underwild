export class LeafParticle {
  constructor(blockId, x, y, worldTime, tintFactor) {
    this.blockId = blockId;
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 0.5; // Even more reduced horizontal velocity
    this.vy = -0.05 - Math.random() * 0.05;   // Even more reduced upward velocity
    this.ax = (Math.random() - 0.5) * 0.01; // Horizontal acceleration
    this.width = 6 + Math.random() * 6;  // Random size between 6 and 12
    this.height = 6 + Math.random() * 6;
    this.life = 0;
    this.maxLife = 300 + Math.random() * 300; // 5-10 seconds at 60 FPS
    this.tintFactor = tintFactor || 1;
    this.rotation = Math.random() * Math.PI * 2; // Random initial rotation
    this.rotationSpeed = (Math.random() - 0.5) * 0.02; // Even more reduced rotation speed
    this.createdTime = worldTime;
    this.onGround = false;
    this.alpha = 1; // Initial alpha value
  }

  update(worldTime, world) {
    this.life += 1;
    
    // Apply gravity
    if (!this.onGround) {
      this.vy += 0.02; // Even more reduced gravity
    }
    
    // Apply air resistance
    this.vx *= 0.97; // Increased air resistance
    this.vy *= 0.97; // Increased air resistance
    
    // Update position
    this.vx += this.ax;
    this.x += this.vx;
    this.y += this.vy;
    
    // Update rotation
    this.rotation += this.rotationSpeed;
    
    // Check if particle is out of bounds
    if (this.y > world.height * 16) { // Assuming TILE_SIZE is 16
      return true; // Remove particle
    }
    
    // Check if particle's life is over
    if (this.life > this.maxLife) {
      return true; // Remove particle
    }
    
    // Check collision with blocks
    const tileX = Math.floor(this.x / 16); // Assuming TILE_SIZE is 16
    const tileY = Math.floor(this.y / 16);
    
    if (world.inBounds(tileX, tileY)) {
      const blockType = world.getBlockType(tileX, tileY);
      if (blockType && blockType.solid && (blockType.id === 'oak_log' || blockType.id === 'birch_log' || blockType.id === 'spruce_log' || blockType.id === 'maple_log')) {
        this.onGround = false;
      } else if (blockType && blockType.solid) {
        this.onGround = true;
        this.vy = 0; // Remove bounce
        this.vx *= 0.05;  // Reduce horizontal velocity even more
        this.rotationSpeed *= 0.05; // Reduce rotation speed even more
        this.x += this.vx;
        this.y = tileY * 16 - 0.1; // Place it just above the block

        // Fade out if on the ground
        this.alpha = Math.max(0, 1 - (this.life - this.maxLife * 0.6) / (this.maxLife * 0.4));

        // Randomly change horizontal acceleration
        if (Math.random() < 0.02) {
          this.ax = (Math.random() - 0.5) * 0.01;
        }
        
        // If it's been on the ground for a while and fully faded, remove it
        if (this.life > this.maxLife && this.alpha <= 0) {
          return true; // Remove particle
        }
      } else {
        this.onGround = false;
      }
    } else {
      this.onGround = false;
    }
    
    return false; // Keep particle
  }
}
