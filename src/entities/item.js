const ITEM_CONFIG = {
  pickupRange: 12,
  attractionRange: 24,
  attractionForce: 0.8,
  pickupDelay: 30,
  
  gravity: 0.3,
  width: 8,
  height: 8,
  mass: 1,
  airResistance: 0.95,
  maxVelocity: 30,
  
  maxLife: 0,
  maxItems: 50 // Limit total number of items
};

export class ItemEntity {
  constructor(blockId, x, y, worldTime) {
    this.blockId = blockId;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.life = 0;
    this.age = 0;
    this.mass = ITEM_CONFIG.mass;
    this.width = ITEM_CONFIG.width;
    this.height = ITEM_CONFIG.height;
    this.createdTime = worldTime;
    this.onGround = false;
    this.gravity = ITEM_CONFIG.gravity;
    this.pickupDelay = ITEM_CONFIG.pickupDelay;
    this.readyForPickup = false;
  }

  update(worldTime, world, player) {
    this.life += 1;
    this.age += 1;

    if (this.pickupDelay > 0) {
      this.pickupDelay--;
      if (this.pickupDelay === 0) {
        this.readyForPickup = true;
      }
    }

    if (!this.onGround) {
      this.vy += this.gravity;
    }

    if (this.readyForPickup && player) {
      const playerCenterX = player.x + player.width / 2;
      const playerCenterY = player.y + player.height / 2;
      const itemCenterX = this.x + this.width / 2;
      const itemCenterY = this.y + this.height / 2;
      const distance = Math.sqrt(
        Math.pow(playerCenterX - itemCenterX, 2) + 
        Math.pow(playerCenterY - itemCenterY, 2)
      );
      if (distance < ITEM_CONFIG.attractionRange) {
        const dx = playerCenterX - itemCenterX;
        const dy = playerCenterY - itemCenterY;
        const force = ITEM_CONFIG.attractionForce;
        
        if (distance > 0) {
          this.vx += (dx / distance) * force;
          this.vy += (dy / distance) * force;
        }
      }
    }

    this.vx *= ITEM_CONFIG.airResistance;
    this.vy *= ITEM_CONFIG.airResistance;
    
    const maxVel = ITEM_CONFIG.maxVelocity;
    if (Math.abs(this.vx) > maxVel) this.vx = Math.sign(this.vx) * maxVel;
    if (Math.abs(this.vy) > maxVel) this.vy = Math.sign(this.vy) * maxVel;
    
    this.x += this.vx;
    this.y += this.vy;

    // Check if item is out of bounds (below world)
    if (this.y > world.height * 16) {
      this.y = world.height * 16 - this.height;
      this.vy = 0;
      this.onGround = true;
    }

    // Ground check - only collide with solid blocks, pass through everything else
    const feetY = this.y + this.height;
    const feetTileY = Math.floor(feetY / 16);
    
    // Check both left and right edges of the item
    const leftTileX = Math.floor(this.x / 16);
    const rightTileX = Math.floor((this.x + this.width - 0.1) / 16);
    
    // Reset onGround status
    this.onGround = false;
    
    for (let tileX = leftTileX; tileX <= rightTileX; tileX++) {
      if (world.inBounds(tileX, feetTileY)) {
        const blockType = world.getBlockType(tileX, feetTileY);
        // Only solid blocks provide ground collision
        if (blockType && blockType.solid) {
          // Item is standing on a solid block
          this.y = feetTileY * 16 - this.height;
          this.vy = 0;
          this.onGround = true;
          // Stop horizontal movement when on ground
          this.vx = 0;
          break;
        }
        // Non-solid blocks (grass, flowers, etc.) are completely ignored - items pass through
      }
    }

    // Simple collision check - if we're inside a solid block, push out
    // Only collide with solid blocks, pass through non-solid blocks
    const centerX = this.x + this.width / 2;
    const centerY = this.y + this.height / 2;
    const centerTileX = Math.floor(centerX / 16);
    const centerTileY = Math.floor(centerY / 16);

    if (world.inBounds(centerTileX, centerTileY)) {
      const blockType = world.getBlockType(centerTileX, centerTileY);
      // Only collide with blocks that have collision (solid blocks)
      if (blockType && blockType.solid) {
        // We're inside a solid block, push out vertically
        const tileTop = centerTileY * 16;
        const tileBottom = tileTop + 16;
        
        // Push out to the nearest edge
        if (Math.abs(this.y - tileTop) < Math.abs(this.y + this.height - tileBottom)) {
          // Closer to top, push up
          this.y = tileTop - this.height;
          this.vy = 0;
          // If we're being pushed up, we're likely hitting a ceiling, so stop horizontal movement
          this.vx = 0;
        } else {
          // Closer to bottom, push down
          this.y = tileBottom;
          this.vy = 0;
        }
      }
    }

    // Items never expire if maxLife is 0
    if (ITEM_CONFIG.maxLife > 0 && this.life > ITEM_CONFIG.maxLife) {
      return true; // Remove item
    }
    
    return false; // Keep item
  }
  
  // Method to update configuration (for runtime changes)
  static updateConfig(newConfig) {
    Object.assign(ITEM_CONFIG, newConfig);
  }
  
  // Method to get current configuration
  static getConfig() {
    return { ...ITEM_CONFIG };
  }
}
