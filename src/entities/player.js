import { TILE_SIZE } from '../core/utils.js';
import { resolvePlayerPhysics } from '../core/physics.js';

export class Player {
  constructor(world, registry, x, y, username = 'Player') {
    this.username = username;
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
    
    this.swingAnimation = {
      active: false,
      progress: 0,
      duration: 0.15,
      startTime: 0,
      continuous: false,
      cycleCount: 0
    };
    
    this.facingDirection = 1;
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
    
    if (!this.world) {
      return;
    }
    
    if (Math.abs(this.vx) > 10) {
      this.facingDirection = this.vx > 0 ? 1 : -1;
    }
    
    if (this.swingAnimation.active) {
      const currentTime = this.world.time || time;
      const elapsed = (currentTime - this.swingAnimation.startTime) / 1000;
      
      if (this.swingAnimation.continuous) {
        this.swingAnimation.progress = (elapsed % this.swingAnimation.duration) / this.swingAnimation.duration;
        this.swingAnimation.cycleCount = Math.floor(elapsed / this.swingAnimation.duration);
        
        this.swingAnimation.active = true;
      } else {
        this.swingAnimation.progress = Math.min(elapsed / this.swingAnimation.duration, 1);
        
        if (this.swingAnimation.progress >= 1) {
          this.swingAnimation.active = false;
          this.swingAnimation.progress = 0;
          this.swingAnimation.cycleCount = 0;
        }
      }
    }
    
    const defaultKeybinds = {
      forward: 'KeyW',
      backward: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      jump: 'Space',
      sprint: 'ShiftLeft',
      inventory: 'KeyE',
      chat: 'KeyT',
      drop: 'KeyQ',
      pause: 'Escape',
      background: 'KeyZ',
      rotate: 'KeyR',
      flip: 'KeyF'
    };
    const keybinds = typeof window !== 'undefined' && window.keybinds ? window.keybinds : defaultKeybinds;
    resolvePlayerPhysics(this, this.world, input, dt, noClipMode, creativeMode, keybinds);
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
    
    const side = this.facingDirection;
    
    const baseDistance = 12;
    let handX = centerX + (side * baseDistance);
    let handY = centerY + 2;
    
    return { x: handX, y: handY };
  }
}
