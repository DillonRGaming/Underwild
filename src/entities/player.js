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
    this.maxSpeed = 120;
    this.jumpVelocity = 300;
    this.gravity = 800;
    this.maxFallSpeed = 600;
    this.onGround = false;
    
    // Hand swing animation
    this.swingAnimation = {
      active: false,
      progress: 0,
      duration: 0.15, // 150ms swing duration for responsive mining feel
      startTime: 0,
      continuous: false, // New: for continuous swinging while holding buttons
      cycleCount: 0 // Track how many cycles we've done
    };
    
    // Facing direction and mouse tracking
    this.facingDirection = 1; // 1 for right, -1 for left
    this.lastMouseX = 0;
    this.lastMouseY = 0;
  }
  update(input, dt, time, noClipMode = false, creativeMode = false) {
    const textInputMode = typeof window !== 'undefined' && window.textInputMode;
    if (textInputMode) {
      this.vx = 0;
      this.vy = 0;
      return;
    }
    
    // Check if world exists before proceeding with physics
    if (!this.world) {
      // World not created yet, just return without updating physics
      return;
    }
    
    // Track movement direction
    if (Math.abs(this.vx) > 10) { // Only update if moving with some speed
      this.facingDirection = this.vx > 0 ? 1 : -1;
    }
    
    // Update swing animation - BULLETPROOF VERSION
    if (this.swingAnimation.active) {
      // Use world time from the world object for consistency
      const currentTime = this.world.time || time;
      const elapsed = (currentTime - this.swingAnimation.startTime) / 1000; // Convert to seconds
      
      if (this.swingAnimation.continuous) {
        // For continuous animation, ALWAYS keep it running
        this.swingAnimation.progress = (elapsed % this.swingAnimation.duration) / this.swingAnimation.duration;
        this.swingAnimation.cycleCount = Math.floor(elapsed / this.swingAnimation.duration);
        
        // Ensure animation never stops when continuous
        this.swingAnimation.active = true;
      } else {
        // Single swing animation
        this.swingAnimation.progress = Math.min(elapsed / this.swingAnimation.duration, 1);
        
        if (this.swingAnimation.progress >= 1) {
          this.swingAnimation.active = false;
          this.swingAnimation.progress = 0;
          this.swingAnimation.cycleCount = 0;
        }
      }
    }
    
    resolvePlayerPhysics(this, this.world, input, dt, noClipMode, creativeMode);
  }
  getHeadAnchor() {
    return { x: this.x + this.width / 2, y: this.y + Math.max(6, this.height * 0.25) };
  }
  
  startSwing(time, continuous = false) {
    this.swingAnimation.active = true;
    this.swingAnimation.progress = 0;
    this.swingAnimation.startTime = time;
    this.swingAnimation.continuous = continuous;
    this.swingAnimation.cycleCount = 0;
  }
  
  startContinuousSwing(time) {
    this.startSwing(time, true);
  }
  
  stopSwing() {
    this.swingAnimation.active = false;
    this.swingAnimation.continuous = false;
    this.swingAnimation.progress = 0;
    this.swingAnimation.cycleCount = 0;
  }
  
  updateMousePosition(mouseWorldX, mouseWorldY) {
    this.lastMouseX = mouseWorldX;
    this.lastMouseY = mouseWorldY;
  }
  
  getHandPosition() {
    const centerX = this.x + this.width / 2;
    const centerY = this.y + this.height / 2;
    
    // Use only movement direction, not mouse position
    const side = this.facingDirection;
    
    // Base position - better distance and height
    const baseDistance = 12;
    let handX = centerX + (side * baseDistance);
    let handY = centerY + 2;
    
    // No animation - hand stays in fixed position
    
    return { x: handX, y: handY };
  }
}
