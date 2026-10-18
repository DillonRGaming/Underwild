import { waterMass } from '../logic/water.js';
const ITEM_CONFIG = {
  pickupRange: 12,
  attractionRange: 16,
  attractionForce: 0.8,
  pickupDelay: 30,
  
  gravity: 0.15,
  maxFallSpeed: 5,
  width: 6,
  height: 6,
  mass: 1,
  airResistance: 0.95,
  maxVelocity: 30,
  
  maxLife: 0,
  maxItems: 50
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
    this.count = 1;
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

    // Float in water, half submerged.
    const cx = Math.floor((this.x + this.width / 2) / 16);
    const cy = Math.floor((this.y + 2) / 16);
    const water = world.inBounds(cx, cy) ? world.waterAt(cx, cy) : 0;
    if (water > 0) {
      const above = world.inBounds(cx, cy - 1) && world.waterAt(cx, cy - 1) > 0;
      const surfaceY = above ? -Infinity : (cy + 1) * 16 - Math.min(1, water) * 16;
      // Buoyancy matches gravity when the item's middle is at the water line, so it sits
      // half in, half out; deeper it's pushed up, higher it settles back down.
      // The sprite is drawn centred on (x, y), so y is the item's visual middle.
      const bob = Math.sin(this.age * 0.06) * 1;
      const depth = this.y - surfaceY - bob;
      if (depth > -5) {
        const lift = Math.max(0, Math.min(2, 1 + depth / 5));
        this.vy -= this.gravity * lift;
        this.vy *= 0.85;
        this.vx *= 0.97;
      }
    }

    if (this.readyForPickup && player) {
      const itemCenterX = this.x + this.width / 2;
      const itemCenterY = this.y + this.height / 2;
      
      const playerCenterX = player.x + player.width / 2;
      const playerCenterY = player.y + player.height / 2;
      const headY = player.y + player.height * 0.3;
      const feetY = player.y + player.height;
      
      const torsoDistance = Math.sqrt(Math.pow(playerCenterX - itemCenterX, 2) + Math.pow(playerCenterY - itemCenterY, 2));
      const headDistance = Math.sqrt(Math.pow(playerCenterX - itemCenterX, 2) + Math.pow(headY - itemCenterY, 2));
      const feetDistance = Math.sqrt(Math.pow(playerCenterX - itemCenterX, 2) + Math.pow(feetY - itemCenterY, 2));
      
      let closestX = playerCenterX;
      let closestY = playerCenterY;
      const distances = [torsoDistance, headDistance, feetDistance];
      const positions = [
        {x: playerCenterX, y: playerCenterY},
        {x: playerCenterX, y: headY},
        {x: playerCenterX, y: feetY}
      ];
      
      const minIndex = distances.indexOf(Math.min(...distances));
      closestX = positions[minIndex].x;
      closestY = positions[minIndex].y;
      const distance = distances[minIndex];
      
      if (distance < ITEM_CONFIG.attractionRange) {
        const dx = closestX - itemCenterX;
        const dy = closestY - itemCenterY;
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
    if (this.vy > ITEM_CONFIG.maxFallSpeed) this.vy = ITEM_CONFIG.maxFallSpeed;

    // Stuck inside a block (placed on top of it, or pushed in): squeeze out to the nearest
    // open side instead of sitting there.
    const solidAt = (tx, ty) => {
      if (!world.inBounds(tx, ty)) return false;
      const t = world.getBlockType(tx, ty);
      return !!t && !!t.solid && world.getCell(tx, ty).meta?.layer !== 'bg';
    };
    const inX = Math.floor((this.x + this.width / 2) / 16);
    const inY = Math.floor((this.y + this.height / 2) / 16);
    if (solidAt(inX, inY)) {
      const lx = (this.x + this.width / 2) - inX * 16;
      const ly = (this.y + this.height / 2) - inY * 16;
      const options = [
        [0, -1, ly + 4],
        [-1, 0, lx],
        [1, 0, 16 - lx],
        [0, 1, 16 - ly + 8]
      ].filter(([dx, dy]) => !solidAt(inX + dx, inY + dy)).sort((a, b) => a[2] - b[2]);
      const [dx, dy] = options[0] || [0, -1];
      this.x += dx * 1.5;
      this.y += dy * 1.5;
      this.vx = dx * 0.5;
      this.vy = dy * 0.5;
      this.onGround = false;
      return ITEM_CONFIG.maxLife > 0 && this.life > ITEM_CONFIG.maxLife;
    }
    
    // Horizontal movement & wall collision
    this.x += this.vx;
    const midY = this.y + this.height * 0.5;
    const midTileY = Math.floor(midY / 16);
    if (this.vx > 0) {
      const rightTile = Math.floor((this.x + this.width) / 16);
      if (solidAt(rightTile, midTileY)) {
        this.x = rightTile * 16 - this.width - 0.01;
        this.vx = -this.vx * 0.3;
      }
    } else if (this.vx < 0) {
      const leftTile = Math.floor(this.x / 16);
      if (solidAt(leftTile, midTileY)) {
        this.x = (leftTile + 1) * 16 + 0.01;
        this.vx = -this.vx * 0.3;
      }
    }

    // Vertical movement & ground/ceiling collision
    this.y += this.vy;

    if (this.vy < 0) {
      const headTileY = Math.floor(this.y / 16);
      const leftHeadX = Math.floor(this.x / 16);
      const rightHeadX = Math.floor((this.x + this.width - 0.1) / 16);
      for (let tileX = leftHeadX; tileX <= rightHeadX; tileX++) {
        if (world.inBounds(tileX, headTileY) && solidAt(tileX, headTileY)) {
          this.y = (headTileY + 1) * 16;
          this.vy = 0;
          break;
        }
      }
    }

    if (this.y > world.height * 16) {
      this.y = world.height * 16 - this.height;
      this.vy = 0;
      this.onGround = true;
    }

    const feetY = this.y + this.height;
    const feetTileY = Math.floor(feetY / 16);
    
    const leftTileX = Math.floor(this.x / 16);
    const rightTileX = Math.floor((this.x + this.width - 0.1) / 16);
    
    this.onGround = false;
    
    for (let tileX = leftTileX; tileX <= rightTileX; tileX++) {
      if (world.inBounds(tileX, feetTileY)) {
        if (solidAt(tileX, feetTileY)) {
          this.y = feetTileY * 16 - this.height;
          if (this.vy > 1.2) {
            this.vy = -this.vy * 0.25;
          } else {
            this.vy = 0;
            this.onGround = true;
          }
          this.vx *= 0.65;
          if (Math.abs(this.vx) < 0.05) this.vx = 0;
          break;
        }
      }
    }

    if (this.onGround) {
      this.vx *= 0.75;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }

    if (ITEM_CONFIG.maxLife > 0 && this.life > ITEM_CONFIG.maxLife) {
      return true;
    }
    
    return false;
  }
  
  static updateConfig(newConfig) {
    Object.assign(ITEM_CONFIG, newConfig);
  }
  
  static getConfig() {
    return { ...ITEM_CONFIG };
  }
}
