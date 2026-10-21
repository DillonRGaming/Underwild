import { TILE_SIZE } from '../core/utils.js';
import { resolvePlayerPhysics } from '../core/physics.js';

const NO_INPUT = { isKeyDown: () => false };

const DIFFICULTY_DAMAGE = { peaceful: 0.25, easy: 0.5, normal: 1, hard: 1.5 };

const DEFAULT_KEYBINDS = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouch: 'ControlLeft'
};

export class Player {
  constructor(world, registry, x, y, username = 'Player') {
    this.username = username;
    this.world = world;
    this.registry = registry;
    this.x = x;
    this.y = y;
    this.width = 12; // narrow enough to drop through an open trapdoor (13px gap)
    this.height = 32;
    this.vx = 0;
    this.vy = 0;
    this.maxSpeed = 120;
    // Same jump height as before (about 3.5 blocks), but a slower, floatier arc.
    this.jumpVelocity = 276;
    this.gravity = 680;
    this.maxFallSpeed = 450;
    this.onGround = false;

    this.swingAnimation = {
      active: false,
      progress: 0,
      duration: 0.15,
      startTime: 0,
      continuous: false,
      cycleCount: 0
    };

    this.health = 20;
    this.maxHealth = 20;
    this.hunger = 20;
    this.maxHunger = 20;

    this.fallStartY = 0;
    this.falling = false;
    this.fallDamageEnabled = true;

    this.facingDirection = 1;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this.walkAnimation = 0;
    this.walkCycle = 0;
    this.isMoving = false;
    this.movingSpeed = 0;
    this.walkingSpeedFactor = 1.0;
    this.inAir = true;
    this.swingingArm = 0;
  }
  update(input, dt, time, noClipMode = false, creativeMode = false) {
    if (!this.world) return;

    if (Math.abs(this.vx) > 10) {
      this.facingDirection = this.vx > 0 ? 1 : -1;
    }

    this.movingSpeed = Math.abs(this.vx);
    this.isMoving = this.movingSpeed > 5;
    this.inAir = !this.onGround;

    const baseSpeed = 8.0;

    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    let speedFactor = Math.min(2.0, Math.max(0, currentSpeed / 120));

    if (this.inAir) {
      speedFactor *= 0.5;
    }

    this.walkingSpeedFactor = speedFactor;

    if (currentSpeed > 1) {
      this.walkAnimation += dt * baseSpeed * speedFactor;
    } else {
      this.walkAnimation *= 0.9;
      if (Math.abs(this.walkAnimation) < 0.01) {
        this.walkAnimation = 0;
      }
    }
    this.walkCycle = this.walkAnimation % (Math.PI * 2);

    if (this.swingAnimation.active) {
      const elapsed = this.world.time - this.swingAnimation.startTime;

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

    if (this.swingAnimation.active && this.swingAnimation.continuous) {
      this.swingingArm = Math.sin((this.swingAnimation.cycleCount + this.swingAnimation.progress) * Math.PI * 2) * 0.5 + 0.5;
    } else if (this.swingAnimation.active && !this.swingAnimation.continuous) {
      this.swingingArm = this.swingAnimation.progress;
    } else {
      if (this.swingingArm > 0) {
        this.swingingArm = Math.max(0, this.swingingArm - dt * 5);
      } else {
        this.swingingArm = 0;
      }
    }

    resolvePlayerPhysics(this, this.world, this.inputLocked ? NO_INPUT : input, dt, noClipMode, creativeMode, this.keybinds || DEFAULT_KEYBINDS);
  }
  getHeadAnchor() {
    return { x: this.x + this.width / 2, y: this.y + 16 };
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

  playArmAction(type) {
    this.armAction = { type, start: performance.now() };
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

  setHealth(amount) {
    this.health = Math.max(0, Math.min(amount, this.maxHealth));
    return this.health;
  }

  addHealth(amount) {
    this.health = Math.max(0, Math.min(this.health + amount, this.maxHealth));
    return this.health;
  }

  takeDamage(amount) {
    if (!this.fallDamageEnabled || (this.world && this.world.creativeMode)) return;
    const scaled = amount * (DIFFICULTY_DAMAGE[this.world?.difficulty] ?? 1);
    if (scaled <= 0) return;
    this.health = Math.max(0, this.health - Math.max(1, Math.round(scaled)));
    this.hurtAt = performance.now();
    this.onHurt?.();
    if (this.health <= 0) this.die();
  }

  die() {
    this.health = Math.max(1, Math.floor(this.maxHealth / 2));
    this.vx = 0;
    this.vy = 0;
    this.falling = false;
    if (this.spawnPoint) {
      this.x = this.spawnPoint.x;
      this.y = this.spawnPoint.y;
    }
  }

  setHunger(amount) {
    this.hunger = Math.max(0, Math.min(amount, this.maxHunger));
    return this.hunger;
  }

  addHunger(amount) {
    this.hunger = Math.max(0, Math.min(this.hunger + amount, this.maxHunger));
    return this.hunger;
  }

  trackFall() {
    if (this.onGround) return;
    if (!this.falling) {
      this.falling = true;
      this.fallStartY = this.y;
    } else if (this.y < this.fallStartY) {
      this.fallStartY = this.y;
    }
  }

  cancelFall() {
    this.falling = false;
  }

  land() {
    if (!this.falling) return;
    this.falling = false;
    const gMult = this.world?.gravityMultiplier ?? this.world?.dimension?.gravityMultiplier ?? 1;
    const fallDistance = ((this.y - this.fallStartY) / TILE_SIZE) * gMult;
    if (fallDistance > 3) {
      this.takeDamage(Math.floor(fallDistance - 3));
    }
  }
}
