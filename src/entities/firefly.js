export class Firefly {
  constructor(x, y, worldTime, flowerLocations) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 1; // Much slower initial velocity
    this.vy = (Math.random() - 0.5) * 1;
    this.width = 2;
    this.height = 2;
    this.life = 0;
    this.maxLife = 2400; // Live much longer
    this.createdTime = worldTime;
    
    this.lightLevel = 12; // Brighter base light
    this.lightRadius = 8; // Larger light radius
    this.pulsePhase = Math.random() * Math.PI * 2;
    
    this.glowIntensity = 0;
    this.alpha = 1.0;
    
    // Store flower locations for attraction
    this.flowerLocations = flowerLocations || [];
    this.currentTarget = null;
    this.targetChangeTimer = 0;
    
    // Gentle wandering behavior
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderSpeed = 0.01 + Math.random() * 0.02; // Much slower wandering
    this.wanderRadius = 20 + Math.random() * 30;
    this.wanderForce = 0.05;
    
    // Movement constraints
    this.maxSpeed = 1.5; // Much slower maximum speed
    this.drag = 0.95; // Higher drag for smoother movement
    
    this.active = true;
  }

  update(worldTime, world) {
    this.life += 1;
    this.targetChangeTimer += 1;
    
    const isNight = this.isNightTime(world);
    if (!isNight) {
      // During day, fireflies hide and don't glow
      this.lightLevel = 0;
      return this.life > this.maxLife; // Just check if should be removed
    }
    
    // Night behavior - gentle flying
    this.updateLighting(worldTime);
    
    // Update target flower periodically
    if (this.targetChangeTimer > 300 || !this.currentTarget) { // Change target every 5 seconds
      if (this.flowerLocations.length > 0) {
        this.currentTarget = this.flowerLocations[Math.floor(Math.random() * this.flowerLocations.length)];
        this.targetChangeTimer = 0;
      }
    }
    
    // Gentle wandering movement
    this.wanderAngle += this.wanderSpeed;
    
    let targetX = this.x;
    let targetY = this.y;
    
    // If we have a target flower, move towards it gently
    if (this.currentTarget) {
      const dx = this.currentTarget.worldX - this.x;
      const dy = this.currentTarget.worldY - this.y - 20; // Fly above the flower
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 10) { // Only move if not too close
        targetX = this.x + (dx / distance) * this.wanderRadius;
        targetY = this.y + (dy / distance) * this.wanderRadius;
      }
    }
    
    // Add gentle wandering around the target
    const wanderX = Math.cos(this.wanderAngle) * this.wanderRadius;
    const wanderY = Math.sin(this.wanderAngle * 0.8) * (this.wanderRadius * 0.4);
    
    targetX += wanderX;
    targetY += wanderY;
    
    // Calculate gentle movement towards target
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    
    // Apply very gentle forces
    this.vx += dx * this.wanderForce * 0.001;
    this.vy += dy * this.wanderForce * 0.001;
    
    // Add tiny random movements for natural flutter
    this.vx += (Math.random() - 0.5) * 0.02;
    this.vy += (Math.random() - 0.5) * 0.02;
    
    // Apply drag for smooth movement
    this.vx *= this.drag;
    this.vy *= this.drag;
    
    // Speed limiting
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > this.maxSpeed) {
      this.vx = (this.vx / speed) * this.maxSpeed;
      this.vy = (this.vy / speed) * this.maxSpeed;
    }
    
    // Update position
    this.x += this.vx;
    this.y += this.vy;
    
    // Gentle boundary handling
    if (this.x < 0) {
      this.x = 0;
      this.vx = Math.abs(this.vx) * 0.3;
    }
    if (this.y < 0) {
      this.y = 0;
      this.vy = Math.abs(this.vy) * 0.3;
    }
    if (this.x > world.width * 16) {
      this.x = world.width * 16;
      this.vx = -Math.abs(this.vx) * 0.3;
    }
    if (this.y > world.height * 16) {
      this.y = world.height * 16;
      this.vy = -Math.abs(this.vy) * 0.3;
    }
    
    // Gentle avoidance of solid blocks
    const tileX = Math.floor(this.x / 16);
    const tileY = Math.floor(this.y / 16);
    if (world.inBounds(tileX, tileY)) {
      const blockType = world.getBlockType(tileX, tileY);
      if (blockType && blockType.solid) {
        // Gently move away from solid blocks
        this.vy -= 0.2; // Gentle upward movement
        this.vx += (Math.random() - 0.5) * 0.1;
      }
    }
    
    return this.life > this.maxLife;
  }
  
  updateLighting(worldTime) {
    const pulseSpeed = 0.02; // Slower, more subtle pulse
    const pulse = Math.sin(worldTime * pulseSpeed + this.pulsePhase) * 0.3 + 0.7; // Less variation, higher baseline
    
    const flicker = 0.9 + Math.random() * 0.1; // Very subtle flicker
    
    // Bright light with subtle variation - minimum 10, maximum 15
    this.lightLevel = Math.floor((pulse * flicker * 5) + 10);
    
    this.glowIntensity = pulse * flicker * 0.8; // Subtle glow intensity
    
    this.alpha = 0.95 + pulse * 0.05; // Very subtle alpha change
    
    this.lightLevel = Math.max(10, Math.min(15, this.lightLevel));
  }
  
  isNightTime(world) {
    // Use the same night detection as spawning system
    const timeOfDay = (world.time % world.dayLength) / world.dayLength;
    const sunPhase = (timeOfDay - 0.25 + 1) % 1; // 0..1 where 0 = sunrise, 0.5 = noon
    return sunPhase > 0.7 || sunPhase < 0.3; // Night time
  }
  
  getLightAffectedTiles() {
    const tiles = [];
    const tileX = Math.floor(this.x / 16);
    const tileY = Math.floor(this.y / 16);
    
    for (let dy = -this.lightRadius; dy <= this.lightRadius; dy++) {
      for (let dx = -this.lightRadius; dx <= this.lightRadius; dx++) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= this.lightRadius) {
          // Gentle light falloff for wide spread
          const falloff = Math.max(0, this.lightLevel - Math.floor(distance * 1.2));
          if (falloff > 0) {
            tiles.push({
              x: tileX + dx,
              y: tileY + dy,
              distance: distance,
              lightLevel: falloff
            });
          }
        }
      }
    }
    
    return tiles;
  }
}
