import { waterMass } from '../logic/water.js';
import { TILE_SIZE } from './utils.js';
const EDGE_EPS = 0.01;
// Swimming speeds (px/s).
const SWIM_SINK_SPEED = 25;
const SWIM_DIVE_SPEED = 70;
const SWIM_UP_SPEED = 75;

const LADDER_CLIMB_SPEED = 70;
const LADDER_SLIDE_SPEED = 40;
const CROUCH_SPEED = 0.35;
const LADDER_REACH = 6;
const FEET_INSET = 4;

function hasGroundBelow(world, x, player) {
  const ty = Math.floor((player.y + player.height + 1) / TILE_SIZE);
  for (const fx of [x + FEET_INSET, x + player.width - FEET_INSET]) {
    const tx = Math.floor(fx / TILE_SIZE);
    if (topSurfaceY(world, tx, ty, (fx - tx * TILE_SIZE) / TILE_SIZE) !== null) return true;
  }
  return false;
}

function isOnLadder(player, world) {
  const left = Math.floor(player.x / TILE_SIZE);
  const right = Math.floor((player.x + player.width - EDGE_EPS) / TILE_SIZE);
  const top = Math.floor(player.y / TILE_SIZE);
  const bottom = Math.floor((player.y + player.height - 1) / TILE_SIZE);
  for (let tx = left; tx <= right; tx++) {
    for (let ty = top; ty <= bottom; ty++) {
      if (!world.inBounds(tx, ty) || !world.getBlockType(tx, ty)?.climbable) continue;
      const wall = world.getCell(tx, ty).meta?.wall;
      const minX = wall === 'right' ? (tx + 1) * TILE_SIZE - LADDER_REACH : tx * TILE_SIZE;
      const maxX = wall === 'right' ? (tx + 1) * TILE_SIZE : tx * TILE_SIZE + LADDER_REACH;
      if (player.x < maxX && player.x + player.width > minX) return true;
    }
  }
  return false;
}

function isBlockSolid(world, x, y) {
  if (!world.isChunkLoaded(Math.floor(x / world.chunkSize))) return true;
  const cell = world.getCell(x, y);
  const type = world.registry.get(cell.id);
  if (!type) return false;
  if (cell.meta?.layer === 'bg') return false;
  if (cell.meta?.noCollision) return false;
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
      return tileTop + (type.surfaceInset || 0) * TILE_SIZE / 16;
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

export function resolvePlayerPhysics(player, world, input, dt, noClipMode = false, creativeMode = false, keybinds) {
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  const playerTileX = Math.floor(playerCenterX / TILE_SIZE);
  const playerTileY = Math.floor(playerCenterY / TILE_SIZE);
  // How much of the player is under water (0..1), from the water line in their column.
  const waterAt = (y) => {
    const ty = Math.floor(y / TILE_SIZE);
    if (!world.inBounds(playerTileX, ty)) return false;
    const m = waterMass(world.getCell(playerTileX, ty));
    if (m <= 0) return false;
    const aboveWet = world.inBounds(playerTileX, ty - 1) && waterMass(world.getCell(playerTileX, ty - 1)) > 0;
    return aboveWet || y >= (ty + 1) * TILE_SIZE - Math.min(1, m) * TILE_SIZE;
  };
  const feetWet = waterAt(player.y + player.height - 1);
  const waistWet = waterAt(player.y + player.height * 0.55);
  const headWet = waterAt(player.y + 4);
  const inWater = waistWet || (feetWet && !player.onGround);

  if (!player.creativeFlying) player.creativeFlying = false;
  if (!player.lastJumpPress) player.lastJumpPress = 0;
  if (!player.jumpPressed) player.jumpPressed = false;

  const isCrouching = !player.creativeFlying && input.isKeyDown(keybinds.crouch || 'ControlLeft');
  const isSprinting = !isCrouching && (input.isKeyDown(keybinds.sprint) || input.isKeyDown('ShiftRight'));
  player.crouching = isCrouching;

  let gravity = player.gravity;
  let walkSpeed = 60;
  let sprintSpeed = 90;
  let jumpVelocity = player.jumpVelocity;
  let accel = player.onGround ? (isSprinting ? 1100 : 900) : 600;

  // Swimming, Minecraft-style: slower sideways, slowly sink, hold jump to swim up.
  if (inWater && !noClipMode) {
    walkSpeed *= 0.55;
    sprintSpeed *= 0.7;
    accel = 700;
  }

  const maxSpeed = isCrouching ? walkSpeed * CROUCH_SPEED : (isSprinting ? sprintSpeed : walkSpeed);

  if (noClipMode) {
    player.cancelFall?.();
    const moveSpeed = maxSpeed * 2.5;
    player.vx = 0;
    player.vy = 0;

    if (input.isKeyDown(keybinds.right)) player.vx += moveSpeed;
    if (input.isKeyDown(keybinds.left)) player.vx -= moveSpeed;

    if (input.isKeyDown(keybinds.forward)) player.vy -= moveSpeed;
    if (input.isKeyDown(keybinds.backward)) player.vy += moveSpeed;

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    return;
  }

  const target = (input.isKeyDown(keybinds.right) ? 1 : 0) - (input.isKeyDown(keybinds.left) ? 1 : 0);
  const desiredVx = target * maxSpeed;
  const dv = desiredVx - player.vx;
  const step = Math.sign(dv) * Math.min(Math.abs(dv), accel * dt);
  player.vx += step;

  if (target === 0) {
    const friction = inWater ? 6 : (player.onGround ? 12 : 1);
    player.vx *= Math.max(0, 1 - friction * dt);
    if (Math.abs(player.vx) < 1) player.vx = 0;
  }

  const jumpKeyPressed = input.isKeyDown(keybinds.forward) || input.isKeyDown(keybinds.jump);

  if (creativeMode && jumpKeyPressed && !player.jumpPressed) {
    const now = Date.now();
    if (now - player.lastJumpPress < 500) {
      const wasFlying = player.creativeFlying;
      player.creativeFlying = !player.creativeFlying;

      if (wasFlying !== player.creativeFlying) {
        player.isFlying = player.creativeFlying;
      }
    }
    player.lastJumpPress = now;
  }
  player.jumpPressed = jumpKeyPressed;

  if (creativeMode && player.creativeFlying) {
    player.onGround = false;
    player.cancelFall?.();
    const baseFlySpeed = maxSpeed * 1.5;
    const flySpeed = isSprinting ? baseFlySpeed * 1.5 : baseFlySpeed;
    player.vx = 0;
    player.vy = 0;

    if (input.isKeyDown(keybinds.right)) player.vx += flySpeed;
    if (input.isKeyDown(keybinds.left)) player.vx -= flySpeed;

    if (jumpKeyPressed) player.vy -= flySpeed;
    if (input.isKeyDown('ControlLeft') || input.isKeyDown('ControlRight') || input.isKeyDown(keybinds.backward)) player.vy += flySpeed;

    let nextX = player.x + player.vx * dt;
    let nextY = player.y + player.vy * dt;

    const dirX = Math.sign(player.vx);
    if (dirX !== 0) {
      const left = Math.floor(nextX / TILE_SIZE);
      const right = Math.floor((nextX + player.width - EDGE_EPS) / TILE_SIZE);
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

    const dirY = Math.sign(player.vy);
    if (dirY !== 0) {
      const left = Math.floor(nextX / TILE_SIZE);
      const right = Math.floor((nextX + player.width - EDGE_EPS) / TILE_SIZE);
      const top = Math.floor(nextY / TILE_SIZE);
      const bottom = Math.floor((nextY + player.height - 1) / TILE_SIZE);
      for (let tx = left; tx <= right; tx++) {
        const ty = dirY > 0 ? bottom : top;
        if (isBlockSolid(world, tx, ty)) {
          if (dirY > 0) nextY = ty * TILE_SIZE - player.height - 0.01;
          else nextY = (ty + 1) * TILE_SIZE + 0.01;
          player.vy = 0;
          break;
        }
      }
    }

    player.x = nextX;
    player.y = nextY;

    return;
  }

  const onLadder = !noClipMode && isOnLadder(player, world);
  if (onLadder) {
    if (jumpKeyPressed) player.vy = -LADDER_CLIMB_SPEED;
    else if (input.isKeyDown(keybinds.backward)) player.vy = LADDER_CLIMB_SPEED;
    else if (isCrouching) player.vy = 0;
    else player.vy = Math.min(Math.max(player.vy, 0), LADDER_SLIDE_SPEED);
  } else if (inWater) {
    // Ease toward a swim speed: up while jump is held (bobbing once the head is out),
    // down faster while crouching, otherwise a slow sink.
    let target = SWIM_SINK_SPEED;
    if (jumpKeyPressed && headWet) target = -SWIM_UP_SPEED;
    else if (jumpKeyPressed) {
      // Head out: hold the water line around the chest, bobbing gently.
      let surfaceY = null;
      for (let ty = Math.floor(player.y / TILE_SIZE); ty <= Math.floor((player.y + player.height) / TILE_SIZE); ty++) {
        const m = world.inBounds(playerTileX, ty) ? waterMass(world.getCell(playerTileX, ty)) : 0;
        if (m > 0) { surfaceY = (ty + 1) * TILE_SIZE - Math.min(1, m) * TILE_SIZE; break; }
      }
      if (surfaceY !== null) {
        const bob = Math.sin(performance.now() / 350) * 1.5;
        const wantY = surfaceY - player.height * 0.45 + bob;
        target = Math.max(-SWIM_UP_SPEED, Math.min(SWIM_UP_SPEED, (wantY - player.y) * 5));
      }
    }
    else if (isCrouching) target = SWIM_DIVE_SPEED;
    player.vy += (target - player.vy) * Math.min(1, 6 * dt);
    // Swimming into a ledge with the head out of the water hops up onto it.
    const ahead = Math.sign(player.vx) || 0;
    if (jumpKeyPressed && !headWet && ahead !== 0) {
      const ledgeX = Math.floor((playerCenterX + ahead * (player.width / 2 + 2)) / TILE_SIZE);
      const feetY = Math.floor((player.y + player.height - 1) / TILE_SIZE);
      if (world.isSolidAt(ledgeX, feetY) && !world.isSolidAt(ledgeX, feetY - 1)) player.vy = Math.min(player.vy, -jumpVelocity * 0.55);
    }
  } else if (jumpKeyPressed) {
    if (player.onGround) {
      player.vy = -jumpVelocity * 0.7;
      player.onGround = false;
    }
  }

  if (player.onGround && player.autoJump !== false) {
    const playerCenterX = player.x + player.width / 2;
    const playerTileX = Math.floor(playerCenterX / TILE_SIZE);
    const playerTileY = Math.floor(player.y / TILE_SIZE);

    const direction = Math.sign(player.vx);
    if (direction !== 0) {
      const aheadX = playerTileX + direction;
      const aheadY = playerTileY;

      if (world.inBounds(aheadX, aheadY)) {
        const aheadBlock = world.getBlockType(aheadX, aheadY);
        const aheadCell = world.getCell(aheadX, aheadY);

        if (aheadBlock && aheadBlock.solid && !aheadCell.meta?.noCollision && aheadCell.meta?.layer !== 'bg') {
          const aboveX = aheadX;
          const aboveY = aheadY - 1;

          if (world.inBounds(aboveX, aboveY)) {
            const aboveBlock = world.getBlockType(aboveX, aboveY);
            const aboveCell = world.getCell(aboveX, aboveY);

            if (!aboveBlock || !aboveBlock.solid || aboveCell.meta?.noCollision) {
              const playerHeadY = playerTileY - 1;
              if (world.inBounds(playerTileX, playerHeadY)) {
                const headBlock = world.getBlockType(playerTileX, playerHeadY);
                const headCell = world.getCell(playerTileX, playerHeadY);

                if (!headBlock || !headBlock.solid || headCell.meta?.noCollision) {
                  player.vy = -jumpVelocity * 0.6;
                  player.onGround = false;
                }
              }
            }
          }
        }
      }
    }
  }

  if (onLadder) {
    if (player.vy > 0 && !jumpKeyPressed && !isCrouching && !input.isKeyDown(keybinds.backward)) player.vy = Math.min(player.vy + gravity * dt, LADDER_SLIDE_SPEED);
  } else if (!inWater) {
    player.vy += gravity * dt;
  }

  const maxFallSpeed = inWater ? SWIM_DIVE_SPEED * 1.5 : player.maxFallSpeed;
  if (player.vy > maxFallSpeed) player.vy = maxFallSpeed;

  let nextX = player.x + player.vx * dt;

  if (!noClipMode) {
    const dirX = Math.sign(player.vx);
    if (dirX !== 0) {
      const left = Math.floor(nextX / TILE_SIZE);
      const right = Math.floor((nextX + player.width - EDGE_EPS) / TILE_SIZE);
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
  if (isCrouching && player.onGround && !onLadder && !hasGroundBelow(world, nextX, player)) {
    nextX = player.x;
    player.vx = 0;
  }
  player.x = nextX;

  let nextY = player.y + player.vy * dt;

  if (!noClipMode) {
    const goingDown = player.vy >= 0;
    const goingUp = player.vy < 0;
    const wasOnGround = player.onGround;
    player.onGround = false;

    const feetLeftX = player.x + FEET_INSET;
    const feetRightX = player.x + player.width - FEET_INSET;

    if (goingDown) {
      const newBottom = nextY + player.height;
      const footTilesX = [
        Math.floor(feetLeftX / TILE_SIZE),
        Math.floor(feetRightX / TILE_SIZE)
      ];
      const footTileY = Math.floor((newBottom - EDGE_EPS) / TILE_SIZE);
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
        
        if (!wasOnGround) player.land?.();
      }
    }

    if (goingUp) {
      const headY = nextY;
      const headTilesY = Math.floor(headY / TILE_SIZE);
      const leftTileX = Math.floor(player.x / TILE_SIZE);
      const rightTileX = Math.floor((player.x + player.width - EDGE_EPS) / TILE_SIZE);
      for (let tx = leftTileX; tx <= rightTileX; tx++) {
        const localLeft = (player.x - tx * TILE_SIZE) / TILE_SIZE;
        const localRight = ((player.x + player.width - EDGE_EPS) - tx * TILE_SIZE) / TILE_SIZE;
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
  if (inWater || onLadder) player.cancelFall?.();
  else player.trackFall?.();

}
