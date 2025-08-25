import { TILE_SIZE } from '../core/utils.js';

const BEE_CONFIG = {
  width: 3,
  height: 3,
  speed: 0.6,
  maxSpeed: 1.5,
  gravity: 0.03,
  groundDistance: 12, // Preferred distance from ground
  groundDistanceVariation: 6, // Random variation in ground distance
  directionChangeChance: 0.015, // Chance to change direction each frame
  maxLife: 0, // 0 means infinite
  groupSize: 3, // Bees spawn in groups
  groupRadius: 20, // Radius for group spawning
  avoidCollisionDistance: 8, // Distance to avoid non-collision blocks
  smoothMovement: 0.95 // Smoothing factor for movement
};

export class Bee {
  constructor(x, y, worldTime) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * BEE_CONFIG.speed;
    this.vy = (Math.random() - 0.5) * BEE_CONFIG.speed;
    this.life = 0;
    this.age = 0;
    this.width = BEE_CONFIG.width;
    this.height = BEE_CONFIG.height;
    this.createdTime = worldTime;
    this.gravity = BEE_CONFIG.gravity;
    this.maxLife = BEE_CONFIG.maxLife;
    this.targetY = y;
    this.directionTimer = 0;
  }

  update(worldTime, world) {
    this.life += 1;
    this.age += 1;
    this.directionTimer++;

    // Find ground level below the bee
    const groundY = this.findGroundLevel(world);
    if (groundY !== null) {
      // Set target Y to be a certain distance above ground
      const targetDistance = BEE_CONFIG.groundDistance + 
        (Math.random() - 0.5) * BEE_CONFIG.groundDistanceVariation;
      this.targetY = groundY - targetDistance;
    }

    // Avoid non-collision blocks
    this.avoidNonCollisionBlocks(world);

    // Apply gravity towards target Y
    const dy = this.targetY - this.y;
    this.vy += dy * 0.008; // Gentler attraction to target height

    // Random direction changes with smoother movement
    if (Math.random() < BEE_CONFIG.directionChangeChance) {
      const randomX = (Math.random() - 0.5) * BEE_CONFIG.speed * 0.3;
      const randomY = (Math.random() - 0.5) * BEE_CONFIG.speed * 0.3;
      
      // Smooth movement changes
      this.vx = this.vx * BEE_CONFIG.smoothMovement + randomX * (1 - BEE_CONFIG.smoothMovement);
      this.vy = this.vy * BEE_CONFIG.smoothMovement + randomY * (1 - BEE_CONFIG.smoothMovement);
    }

    // Apply air resistance
    this.vx *= 0.99;
    this.vy *= 0.99;
    
    // Limit speed
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > BEE_CONFIG.maxSpeed) {
      this.vx = (this.vx / speed) * BEE_CONFIG.maxSpeed;
      this.vy = (this.vy / speed) * BEE_CONFIG.maxSpeed;
    }
    
    // Update position
    this.x += this.vx;
    this.y += this.vy;

    // Keep bee within world bounds
    if (this.x < 0) {
      this.x = 0;
      this.vx = Math.abs(this.vx) * 0.5;
    } else if (this.x > world.width * TILE_SIZE) {
      this.x = world.width * TILE_SIZE;
      this.vx = -Math.abs(this.vx) * 0.5;
    }

    if (this.y < 0) {
      this.y = 0;
      this.vy = Math.abs(this.vy) * 0.5;
    } else if (this.y > world.height * TILE_SIZE) {
      this.y = world.height * TILE_SIZE;
      this.vy = -Math.abs(this.vy) * 0.5;
    }

    // Check if bee should be removed (if maxLife > 0)
    if (this.maxLife > 0 && this.life >= this.maxLife) {
      return true; // Remove bee
    }

    return false; // Keep bee
  }

  findGroundLevel(world) {
    const beeTileX = Math.floor(this.x / TILE_SIZE);
    const beeTileY = Math.floor(this.y / TILE_SIZE);
    
    // Search downward from bee's position
    for (let y = beeTileY; y < world.height; y++) {
      if (world.inBounds(beeTileX, y)) {
        const blockId = world.getBlockId(beeTileX, y);
        if (blockId !== 'air') {
          return y * TILE_SIZE; // Return ground level in world coordinates
        }
      }
    }
    
    return null; // No ground found
  }

  avoidNonCollisionBlocks(world) {
    const beeTileX = Math.floor(this.x / TILE_SIZE);
    const beeTileY = Math.floor(this.y / TILE_SIZE);
    const avoidDistance = BEE_CONFIG.avoidCollisionDistance;
    
    // Check for non-collision blocks in a radius around the bee
    for (let dy = -avoidDistance; dy <= avoidDistance; dy++) {
      for (let dx = -avoidDistance; dx <= avoidDistance; dx++) {
        const checkX = beeTileX + dx;
        const checkY = beeTileY + dy;
        
        if (world.inBounds(checkX, checkY)) {
          const blockId = world.getBlockId(checkX, checkY);
          if (blockId && blockId !== 'air') {
            const blockType = world.registry.get(blockId);
            if (blockType && !blockType.solid) {
              // Calculate distance to this block
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance < avoidDistance && distance > 0) {
                // Push away from non-collision blocks
                const pushForce = (avoidDistance - distance) / avoidDistance * 0.1;
                const pushX = -dx / distance * pushForce;
                const pushY = -dy / distance * pushForce;
                
                this.vx += pushX;
                this.vy += pushY;
              }
            }
          }
        }
      }
    }
  }

  static getConfig() {
    return BEE_CONFIG;
  }
}
