import { TILE_SIZE } from './utils.js';

function isBlockSolid(world, x, y) {
  const cell = world.getCell(x, y);
  if (!cell) return false;
  const type = world.getBlockType(x, y);
  if (!type) return false;
  if (cell.meta?.layer === 'bg') return false;
  if (typeof type.isSolid === 'function') {
    return type.isSolid(cell.meta || {});
  }
  return type.solid;
}

function topSurfaceY(world, tileX, tileY, localX) {
  const type = world.getBlockType(tileX, tileY);
  const cell = world.getCell(tileX, tileY);
  const meta = cell.meta || {};
  if (!isBlockSolid(world, tileX, tileY)) return null;
  const tileTop = tileY * TILE_SIZE;
  switch (type.shape) {
    case 'full':
      return tileTop;
    case 'slab': {
      const pos = meta.slabPos || 'bottom';
      return pos === 'bottom' ? tileTop + TILE_SIZE / 2 : tileTop;
    }
    case 'stairs': {
      const orient = meta.orient || 'right';
      if (orient === 'right') return tileTop + (1 - localX) * TILE_SIZE;
      return tileTop + localX * TILE_SIZE;
    }
    default:
      return tileTop;
  }
}

function ceilingSurfaceY(world, tileX, tileY, localX) {
  const type = world.getBlockType(tileX, tileY);
  const cell = world.getCell(tileX, tileY);
  const meta = cell.meta || {};
  if (!isBlockSolid(world, tileX, tileY)) return null;
  const tileTop = tileY * TILE_SIZE;
  switch (type.shape) {
    case 'full':
      return tileTop + TILE_SIZE;
    case 'slab': {
      const pos = meta.slabPos || 'top';
      return pos === 'top' ? tileTop + TILE_SIZE / 2 : tileTop + TILE_SIZE;
    }
    case 'stairs': {
      return tileTop + TILE_SIZE;
    }
    default:
      return tileTop + TILE_SIZE;
  }
}

export function resolvePlayerPhysics(player, world, input, dt, noClipMode = false) {
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  const playerTileX = Math.floor(playerCenterX / TILE_SIZE);
  const playerTileY = Math.floor(playerCenterY / TILE_SIZE);
  const inWater = world.inBounds(playerTileX, playerTileY) && 
                  world.getBlockId(playerTileX, playerTileY) === 'water';

  const isSprinting = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');
  
  let gravity = player.gravity;
  let walkSpeed = 80; // Further reduced walk speed
  let sprintSpeed = 120; // Further reduced sprint speed
  let jumpVelocity = player.jumpVelocity;
  let accel = player.onGround ? (isSprinting ? 1200 : 800) : 600; // Further reduced acceleration
  
  if (inWater && !noClipMode) {
    gravity *= 0.3;
    walkSpeed *= 0.3;
    sprintSpeed *= 0.3;
    jumpVelocity *= 0.6;
    accel = player.onGround ? 2400 * 0.4 : 1400 * 0.3;
  }
  
  const maxSpeed = isSprinting ? sprintSpeed : walkSpeed;

  if (noClipMode) {
    const moveSpeed = maxSpeed * 0.8;
    player.vx = 0;
    player.vy = 0;
    
    if (input.isKeyDown('KeyD')) player.vx += moveSpeed;
    if (input.isKeyDown('KeyA')) player.vx -= moveSpeed;
    
    if (input.isKeyDown('KeyW')) player.vy -= moveSpeed;
    if (input.isKeyDown('KeyS')) player.vy += moveSpeed;
    
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    
    return;
  }
  
  const target = (input.isKeyDown('KeyD') ? 1 : 0) - (input.isKeyDown('KeyA') ? 1 : 0);
  const desiredVx = target * maxSpeed;
  const dv = desiredVx - player.vx;
  const step = Math.sign(dv) * Math.min(Math.abs(dv), accel * dt);
  player.vx += step;

  if (target === 0) {
    const friction = inWater ? 6 : (player.onGround ? 18 : 1);
    player.vx *= Math.max(0, 1 - friction * dt);
    if (Math.abs(player.vx) < 1) player.vx = 0;
  }

  if (input.isKeyDown('KeyW') || input.isKeyDown('Space')) {
    if (player.onGround) {
      // Apply jump with reduced velocity for slower jumping
      player.vy = -jumpVelocity * 0.7; // Apply full jump velocity
      player.onGround = false;
    } else if (inWater) {
      player.vy -= 200 * dt; // Reduce water jump force
      if (player.vy < -jumpVelocity * 0.5) player.vy = -jumpVelocity * 0.5; // Reduce max water jump velocity
    }
  }
  
  if (inWater && (input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight'))) {
    player.vy += 200 * dt;
  }

  player.vy += gravity * dt;
  
  const maxFallSpeed = inWater ? player.maxFallSpeed * 0.4 : player.maxFallSpeed;
  if (player.vy > maxFallSpeed) player.vy = maxFallSpeed;

  let nextX = player.x + player.vx * dt;
  
  if (!noClipMode) {
    const dirX = Math.sign(player.vx);
    if (dirX !== 0) {
      const left = Math.floor(nextX / TILE_SIZE);
      const right = Math.floor((nextX + player.width) / TILE_SIZE);
      const top = Math.floor(player.y / TILE_SIZE);
      const bottom = Math.floor((player.y + player.height - 1) / TILE_SIZE);
      for (let ty = top; ty <= bottom; ty++) {
        const tx = dirX > 0 ? right : left;
        if (isBlockSolid(world, tx, ty)) {
          if (dirX > 0) nextX = tx * TILE_SIZE - player.width - 0.01;
          else nextX = (tx + 1) * TILE_SIZE + 0.01;
          player.vx = 0;
          break;
        }
      }
    }
  }
  player.x = nextX;

  let nextY = player.y + player.vy * dt;
  
  if (!noClipMode) {
    const goingDown = player.vy >= 0;
    const goingUp = player.vy < 0;
    player.onGround = false;

    const feetLeftX = player.x + 4;
    const feetRightX = player.x + player.width - 4;

    if (goingDown) {
      const newBottom = nextY + player.height;
      const footTilesX = [
        Math.floor(feetLeftX / TILE_SIZE),
        Math.floor(feetRightX / TILE_SIZE)
      ];
      const footTileY = Math.floor(newBottom / TILE_SIZE);
      let minSurface = null;
      for (const tx of footTilesX) {
        const localLeft = (feetLeftX - tx * TILE_SIZE) / TILE_SIZE;
        const localRight = (feetRightX - tx * TILE_SIZE) / TILE_SIZE;
        const s1 = topSurfaceY(world, tx, footTileY, localLeft);
        const s2 = topSurfaceY(world, tx, footTileY, localRight);
        const s = (s1 !== null && s2 !== null) ? Math.min(s1, s2) : (s1 ?? s2);
        if (s !== null) {
          if (minSurface === null || s < minSurface) minSurface = s;
        }
      }
      if (minSurface !== null && newBottom >= minSurface) {
        nextY = minSurface - player.height;
        player.vy = 0;
        player.onGround = true;
      }
    }

    if (goingUp) {
      const headY = nextY;
      const headTilesY = Math.floor(headY / TILE_SIZE);
      const leftTileX = Math.floor(player.x / TILE_SIZE);
      const rightTileX = Math.floor((player.x + player.width - 1) / TILE_SIZE);
      for (let tx = leftTileX; tx <= rightTileX; tx++) {
        const localLeft = (player.x - tx * TILE_SIZE) / TILE_SIZE;
        const localRight = ((player.x + player.width) - tx * TILE_SIZE) / TILE_SIZE;
        const c1 = ceilingSurfaceY(world, tx, headTilesY, localLeft);
        const c2 = ceilingSurfaceY(world, tx, headTilesY, localRight);
        const ceilY = (c1 !== null && c2 !== null) ? Math.min(c1, c2) : (c1 ?? c2);
        if (ceilY !== null && headY <= ceilY) {
          nextY = ceilY + 0.01;
          player.vy = 0;
          break;
        }
      }
    }
  }

  player.y = nextY;

  if (inWater && player.onGround) {
    player.y += Math.sin(Date.now() / 200) * 0.5;
  }
}
