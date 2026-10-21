import { TILE_SIZE } from './utils.js';
import { wind, exposureAt } from './wind.js';
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

// Whether the player's box at (x, y) overlaps anything solid.
function boxBlocked(world, x, y, player) {
  const l = Math.floor(x / TILE_SIZE),
    r = Math.floor((x + player.width - EDGE_EPS) / TILE_SIZE);
  const t = Math.floor(y / TILE_SIZE),
    b = Math.floor((y + player.height - EDGE_EPS) / TILE_SIZE);
  for (let tx = l; tx <= r; tx++) {
    for (let ty = t; ty <= b; ty++) {
      const box = solidBox(world, tx, ty);
      if (box && box.bottom > y && box.top < y + player.height && box.right > x && box.left < x + player.width) return true;
    }
  }
  return false;
}

// Move the player sideways to nextX, stopping at the first solid thing ahead (using each
// cell's real solid part, so slabs and trapdoors only block where they are). Walking
// players step up onto low ledges.
function sweepX(world, player, nextX, canStep) {
  const dirX = Math.sign(nextX - player.x);
  if (dirX === 0) return nextX;
  const top = Math.floor(player.y / TILE_SIZE);
  const bottom = Math.floor((player.y + player.height - 1) / TILE_SIZE);
  let feet = player.y + player.height;
  const from = Math.floor(Math.min(player.x, nextX) / TILE_SIZE);
  const to = Math.floor((Math.max(player.x, nextX) + player.width - EDGE_EPS) / TILE_SIZE);
  for (let tx = dirX > 0 ? from : to; dirX > 0 ? tx <= to : tx >= from; tx += dirX) {
    for (let ty = top; ty <= bottom; ty++) {
      const box = solidBox(world, tx, ty);
      if (!box || box.bottom <= player.y || box.top >= feet) continue;
      if (dirX > 0 ? box.left >= nextX + player.width : box.right <= nextX) continue;
      // Already overlapping something (a ledge we're dropping past): don't move further into
      // it, but walking away from it is fine.
      const overlapping = dirX > 0 ? box.left < player.x + player.width - EDGE_EPS : box.right > player.x + EDGE_EPS;
      if (overlapping) {
        const ahead = dirX > 0 ? box.left > player.x : box.right < player.x + player.width;
        if (ahead) {
          player.vx = 0;
          return player.x;
        }
        continue;
      }
      // A low ledge (a bottom slab or trapdoor) is stepped up onto if there's room.
      if (
        canStep &&
        (player.onGround || feet - box.top <= TILE_SIZE / 2) &&
        feet - box.top > 0 &&
        feet - box.top <= TILE_SIZE / 2 &&
        !boxBlocked(world, nextX, box.top - player.height - 0.01, player)
      ) {
        player.y = box.top - player.height - 0.01;
        player.onGround = true;
        feet = player.y + player.height;
        continue;
      }
      player.vx = 0;
      return dirX > 0 ? box.left - player.width - 0.01 : box.right + 0.01;
    }
  }
  return nextX;
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

// The solid part of a cell in px ({ left, right, top, bottom }), or null if it isn't solid.
// Slabs and closed trapdoors fill a band across the cell; an open trapdoor stands on end
// as a thin strip against its hinge side.
function solidBox(world, tx, ty) {
  if (!isBlockSolid(world, tx, ty)) return null;
  const left = tx * TILE_SIZE,
    top = ty * TILE_SIZE;
  const box = { left, right: left + TILE_SIZE, top, bottom: top + TILE_SIZE };
  const type = world.getBlockType(tx, ty);
  if (type?.shape !== 'slab') {
    box.top += ((type?.surfaceInset || 0) * TILE_SIZE) / 16; // dirt paths sit a texel low
    return box;
  }
  const meta = world.getCell(tx, ty).meta || {};
  const h = (TILE_SIZE * (type.thickness ?? 8)) / 16;
  if (meta.open) {
    if (meta.hinge === 'left') box.right = left + h;
    else box.left = box.right - h;
  } else if ((meta.slabPos || 'bottom') === 'top') box.bottom = top + h;
  else box.top = box.bottom - h;
  return box;
}

const isStrip = (box) => box.right - box.left < TILE_SIZE;

function topSurfaceY(world, tileX, tileY, localX) {
  const type = world.getBlockType(tileX, tileY);
  const cell = world.getCell(tileX, tileY);
  const meta = cell.meta || {};
  if (!isBlockSolid(world, tileX, tileY)) return null;
  const tileTop = tileY * TILE_SIZE;
  switch (type.shape) {
    case 'full':
      return tileTop + ((type.surfaceInset || 0) * TILE_SIZE) / 16;
    case 'slab': {
      const pos = meta.slabPos || 'bottom';
      // Slabs are half a block; thinner ones (trapdoors) set thickness in 16ths.
      return pos === 'bottom' ? tileTop + (TILE_SIZE * (16 - (type.thickness ?? 8))) / 16 : tileTop;
    }
    case 'stairs': {
      // Upside-down stairs are flat on top.
      if (meta.upside) return tileTop;
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
      return pos === 'top' ? tileTop + (TILE_SIZE * (type.thickness ?? 8)) / 16 : tileTop + TILE_SIZE;
    }
    case 'stairs': {
      // Upside-down stairs slope underneath, rising to their tall side.
      if (!meta.upside) return tileTop + TILE_SIZE;
      return (meta.orient || 'right') === 'right' ? tileTop + localX * TILE_SIZE : tileTop + (1 - localX) * TILE_SIZE;
    }
    default:
      return tileTop + TILE_SIZE;
  }
}

// Wind on the player, roughly like real wind: the speed (0..100) is about mph, and the force
// grows with its square, so a breeze does nothing and a gale a lot. On the ground your feet
// hold you until the force beats their grip on the block (sand and metal are slippery, mud and
// grass grippy): on grass you stand still up to about 75, on sand up to about 60. Walking, a
// headwind slows you a little and a tailwind speeds you up. In the air you're carried more
// easily. Crouching makes you a smaller target, and in water, on ladders and out of the open
// air there's none.
const WIND_SLIDE = 90; // px/s you're blown along at, at the top of the scale with nothing holding you
const WIND_WALK = 0.25; // share of your walking speed a full-force wind adds or takes away
// How quickly flying (and noclip) eases toward the speed you're steering at (per second).
const FLY_EASE = 9;
const WIND_AIR = 20; // px/s you drift at in the air, at full force (just a nudge)
const CROUCH_CATCH = 0.4;
const DEFAULT_GRIP = 0.7;
const MATERIAL_GRIP = {
  mud: 0.9,
  grass: 0.8,
  dirt: 0.8,
  clay: 0.8,
  plant: 0.8,
  stone: 0.7,
  sandstone: 0.7,
  coal: 0.65,
  gravel: 0.6,
  wood: 0.6,
  oak: 0.6,
  birch: 0.6,
  spruce: 0.6,
  pine: 0.6,
  maple: 0.6,
  sand: 0.45,
  red_sand: 0.45,
  copper: 0.4,
  steel: 0.4,
  gold: 0.4
};

function gripOf(type) {
  return type?.grip ?? MATERIAL_GRIP[type?.material] ?? DEFAULT_GRIP;
}

// How fast (px/s, negative is left) the wind is pushing the player right now, walking
// (`moving`) or standing.
function windPush(player, world, tileX, inWater, onLadder, crouching, moving, walkSpeed) {
  if (inWater || onLadder) return 0;
  const w = wind.velocityAt(tileX) * exposureAt(world, tileX, Math.floor(player.y / TILE_SIZE));
  if (!w) return 0;
  const dir = Math.sign(w);
  const force = w * w * (crouching ? CROUCH_CATCH : 1); // 0..1 at speed 0..100 (more in gusts)
  if (!player.onGround) return dir * force * WIND_AIR;
  const hold = gripOf(world.getBlockType(tileX, Math.floor((player.y + player.height + 1) / TILE_SIZE))) * 0.75;
  const slide = Math.max(0, force - hold) / (1 - hold);
  return dir * (slide * WIND_SLIDE + (moving ? force * WIND_WALK * walkSpeed : 0));
}

// Crouching shrinks the hitbox (feet stay put) so you can duck under a trapdoor or slab in a
// two-block gap. You stay crouched while there's no room to stand back up.
const CROUCH_SHRINK = 6;

export function resolvePlayerPhysics(player, world, input, dt, noClipMode = false, creativeMode = false, keybinds) {
  // Noclip stays switched on while you're not flying, but only works in flight.
  noClipMode = noClipMode && !!player.creativeFlying;
  const wantCrouch = !player.creativeFlying && input.isKeyDown(keybinds.crouch || 'ControlLeft');
  // Something closing in on the head (a trapdoor shut above you) ducks you down too.
  const stuck =
    !wantCrouch &&
    !noClipMode &&
    !player.creativeFlying &&
    boxBlocked(world, player.x, player.y, player) &&
    (player.crouchBox || !boxBlocked(world, player.x, player.y + CROUCH_SHRINK, { width: player.width, height: player.height - CROUCH_SHRINK }));
  const small = !noClipMode && !player.creativeFlying && (wantCrouch || stuck);
  if (small) {
    player.y += CROUCH_SHRINK;
    player.height -= CROUCH_SHRINK;
  }
  try {
    stepPlayerPhysics(player, world, input, dt, noClipMode, creativeMode, keybinds, stuck);
  } finally {
    if (small) {
      player.height += CROUCH_SHRINK;
      player.y -= CROUCH_SHRINK;
    }
  }
  player.crouchBox = small;
  if (stuck) player.crouching = true;
}

function stepPlayerPhysics(player, world, input, dt, noClipMode, creativeMode, keybinds, forceCrouch) {
  const playerCenterX = player.x + player.width / 2;
  const playerTileX = Math.floor(playerCenterX / TILE_SIZE);
  // How much of the player is under water (0..1), from the water line in their column.
  const waterAt = (y) => {
    const ty = Math.floor(y / TILE_SIZE);
    if (!world.inBounds(playerTileX, ty)) return false;
    const m = world.waterAt(playerTileX, ty);
    if (m <= 0) return false;
    const aboveWet = world.inBounds(playerTileX, ty - 1) && world.waterAt(playerTileX, ty - 1) > 0;
    return aboveWet || y >= (ty + 1) * TILE_SIZE - Math.min(1, m) * TILE_SIZE;
  };
  const feetWet = waterAt(player.y + player.height - 1);
  const waistWet = waterAt(player.y + player.height * 0.55);
  const headWet = waterAt(player.y + 4);
  const inWater = waistWet || (feetWet && !player.onGround);

  player.creativeFlying = !!player.creativeFlying;
  player.lastJumpPress ||= 0;

  const isCrouching = forceCrouch || (!player.creativeFlying && input.isKeyDown(keybinds.crouch || 'ControlLeft'));
  const isSprinting = !isCrouching && (input.isKeyDown(keybinds.sprint) || input.isKeyDown('ShiftRight'));
  player.crouching = isCrouching;

  const gravityMult = world?.gravityMultiplier ?? world?.dimension?.gravityMultiplier ?? 1;
  const gravity = player.gravity * gravityMult;
  let walkSpeed = 60;
  let sprintSpeed = 90;
  const jumpVelocity = player.jumpVelocity * (gravityMult < 1 ? Math.sqrt(gravityMult * 1.8) : 1);
  // A little momentum: speeding up and slowing down take a moment.
  let accel = player.onGround ? (isSprinting ? 760 : 620) : 420;

  // Swimming, Minecraft-style: slower sideways, slowly sink, hold jump to swim up.
  if (inWater && !noClipMode) {
    if (Math.abs(player.vx) > 0.2 || Math.abs(player.vy) > 0.2) {
      world.water?.particles?.wakeUp?.();
    }
    walkSpeed *= 0.55;
    sprintSpeed *= 0.7;
    accel = 700;
  }

  const maxSpeed = isCrouching ? walkSpeed * CROUCH_SPEED : isSprinting ? sprintSpeed : walkSpeed;

  // Double-tap jump toggles flying in creative. Every press is seen (from the key events,
  // not frame polling), and a toggle uses up both taps so a third tap starts a new pair.
  if (input.pressTimes) {
    const now = performance.now();
    // Only two taps of the same key count: W then Space (or Space then W) is just a jump.
    const taps = [...input.pressTimes(keybinds.jump).map((t) => [t, 'jump']), ...(keybinds.forward === keybinds.jump ? [] : input.pressTimes(keybinds.forward)).map((t) => [t, 'forward'])]
      .filter(([t]) => t > (player.lastJumpSeen || 0) && t > now - 1000)
      .sort((a, b) => a[0] - b[0]);
    for (const [t, key] of taps) {
      if (creativeMode && player.lastJumpPress && player.lastJumpKey === key && t - player.lastJumpPress < 350) {
        player.creativeFlying = !player.creativeFlying;
        player.isFlying = player.creativeFlying;
        player.lastJumpPress = 0;
      } else {
        player.lastJumpPress = t;
        player.lastJumpKey = key;
      }
      player.lastJumpSeen = t;
    }
  }
  // No-clip only lasts while flying.
  if (!player.creativeFlying) noClipMode = false;

  if (noClipMode) {
    player.cancelFall?.();
    const moveSpeed = maxSpeed * 2.5;
    let tx = 0,
      ty = 0;
    if (input.isKeyDown(keybinds.right)) tx += moveSpeed;
    if (input.isKeyDown(keybinds.left)) tx -= moveSpeed;
    if (input.isKeyDown(keybinds.forward)) ty -= moveSpeed;
    if (input.isKeyDown(keybinds.backward)) ty += moveSpeed;
    const ease = 1 - Math.exp(-FLY_EASE * dt);
    player.vx += (tx - player.vx) * ease;
    player.vy += (ty - player.vy) * ease;
    if (!tx && Math.abs(player.vx) < 1) player.vx = 0;
    if (!ty && Math.abs(player.vy) < 1) player.vy = 0;

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    return;
  }

  const target = (input.isKeyDown(keybinds.right) ? 1 : 0) - (input.isKeyDown(keybinds.left) ? 1 : 0);
  // The wind shifts the speed you settle at: faster with it, slower against it, and a slow
  // drift (or none, on grippy ground) standing still.
  const push = windPush(player, world, playerTileX, inWater, isOnLadder(player, world), isCrouching, target !== 0, walkSpeed);
  const desiredVx = target * maxSpeed + push;
  // Thrown faster than you can run (an explosion): keep the momentum through the air,
  // slowing gently, rather than braking to a stop and dropping straight down.
  const flung = !player.onGround && !inWater && Math.abs(player.vx) > maxSpeed + Math.abs(push);
  if (flung) {
    player.vx *= Math.max(0, 1 - 0.5 * dt);
    if (target && Math.sign(target) !== Math.sign(player.vx)) player.vx += target * accel * 0.2 * dt;
  } else {
    const dv = desiredVx - player.vx;
    const step = Math.sign(dv) * Math.min(Math.abs(dv), accel * dt);
    player.vx += step;
  }

  if (target === 0 && !flung) {
    const friction = inWater ? 6 : player.onGround ? 7.5 : 1;
    player.vx = push + (player.vx - push) * Math.max(0, 1 - friction * dt);
    if (Math.abs(player.vx) < 1) player.vx = 0;
  }

  const jumpKeyPressed = input.isKeyDown(keybinds.forward) || input.isKeyDown(keybinds.jump);

  if (creativeMode && player.creativeFlying) {
    player.onGround = false;
    player.cancelFall?.();
    const baseFlySpeed = maxSpeed * 1.5;
    const flySpeed = isSprinting ? baseFlySpeed * 1.5 : baseFlySpeed;
    let tx = 0,
      ty = 0;
    if (input.isKeyDown(keybinds.right)) tx += flySpeed;
    if (input.isKeyDown(keybinds.left)) tx -= flySpeed;
    if (jumpKeyPressed) ty -= flySpeed;
    if (input.isKeyDown(keybinds.crouch || 'ControlLeft') || input.isKeyDown('ControlRight') || input.isKeyDown(keybinds.backward)) ty += flySpeed;
    // A little momentum: eases up to speed and glides to a stop.
    const ease = 1 - Math.exp(-FLY_EASE * dt);
    player.vx += (tx - player.vx) * ease;
    player.vy += (ty - player.vy) * ease;
    if (!tx && Math.abs(player.vx) < 1) player.vx = 0;
    if (!ty && Math.abs(player.vy) < 1) player.vy = 0;

    const wantX = player.x + player.vx * dt;
    let nextX = sweepX(world, player, wantX, false);
    // A 2-block gap fits the player exactly, but flying leaves you a hair off the block
    // grid, so you'd catch the block above or below it. Blocked sideways: try lining up with
    // the nearest row (up to half a block away) and go through if that clears the way.
    if (player.vx === 0 && Math.abs(wantX - nextX) > 0.01) {
      const savedY = player.y;
      const aligned = Math.round(player.y / TILE_SIZE) * TILE_SIZE;
      if (aligned !== savedY && Math.abs(aligned - savedY) <= TILE_SIZE / 2 && !boxBlocked(world, player.x, aligned, player)) {
        player.y = aligned;
        player.vx = wantX > player.x ? 1 : -1;
        const tryX = sweepX(world, player, wantX, false);
        if (Math.abs(tryX - player.x) > Math.abs(nextX - player.x) + 0.01) nextX = tryX;
        else player.y = savedY;
        player.vx = 0;
      }
    }
    let nextY = player.y + player.vy * dt;

    const dirY = Math.sign(player.vy);
    if (dirY !== 0) {
      const left = Math.floor(nextX / TILE_SIZE);
      const right = Math.floor((nextX + player.width - EDGE_EPS) / TILE_SIZE);
      const from = Math.floor(Math.min(player.y, nextY) / TILE_SIZE);
      const to = Math.floor((Math.max(player.y, nextY) + player.height - EDGE_EPS) / TILE_SIZE);
      for (let tx = left; tx <= right; tx++) {
        for (let ty = from; ty <= to; ty++) {
          const box = solidBox(world, tx, ty);
          if (!box || box.right <= nextX || box.left >= nextX + player.width) continue;
          if (dirY > 0 && box.top >= player.y + player.height - EDGE_EPS && box.top < nextY + player.height) nextY = box.top - player.height - 0.01;
          else if (dirY < 0 && box.bottom <= player.y + EDGE_EPS && box.bottom > nextY) nextY = box.bottom + 0.01;
          else continue;
          player.vy = 0;
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
        const m = world.inBounds(playerTileX, ty) ? world.waterAt(playerTileX, ty) : 0;
        if (m > 0) {
          surfaceY = (ty + 1) * TILE_SIZE - Math.min(1, m) * TILE_SIZE;
          break;
        }
      }
      if (surfaceY !== null) {
        const bob = Math.sin(performance.now() / 350) * 1.5;
        const wantY = surfaceY - player.height * 0.45 + bob;
        target = Math.max(-SWIM_UP_SPEED, Math.min(SWIM_UP_SPEED, (wantY - player.y) * 5));
      }
    } else if (isCrouching) target = SWIM_DIVE_SPEED;
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

  // Auto-jump: hop up a full-block step at the feet when there's room above it, but not
  // into a wall that's taller than that, and NOT for low half-block ledges/slabs (which sweepX steps up seamlessly).
  // Only while walking that way (the wind blowing you into a step doesn't climb it).
  if (player.onGround && player.autoJump !== false && target !== 0) {
    const direction = Math.sign(player.vx);
    if (direction !== 0) {
      const tileX = Math.floor((player.x + player.width / 2) / TILE_SIZE);
      const aheadX = tileX + direction;
      // The row just above the feet (standing on a dirt path puts the feet a texel low).
      const feetRow = Math.floor((player.y + player.height - TILE_SIZE / 4) / TILE_SIZE);
      const headRow = Math.floor(player.y / TILE_SIZE);
      const solidFull = (x, y) => world.inBounds(x, y) && isBlockSolid(world, x, y) && world.getBlockType(x, y)?.shape !== 'slab';
      const free = (x, y) => !world.inBounds(x, y) || !isBlockSolid(world, x, y);
      const aheadBox = solidBox(world, aheadX, feetRow);
      const stepDiff = aheadBox ? player.y + player.height - aheadBox.top : 0;
      // If the step is <= half a block (e.g. stepping onto a slab, or from a slab onto a block), do not jump!
      if (stepDiff > TILE_SIZE / 2 && solidFull(aheadX, feetRow) && free(aheadX, headRow) && free(aheadX, headRow - 1) && free(tileX, headRow - 1)) {
        player.vy = -jumpVelocity * 0.6;
        player.onGround = false;
      }
    }
  }

  if (onLadder) {
    if (player.vy > 0 && !jumpKeyPressed && !isCrouching && !input.isKeyDown(keybinds.backward))
      player.vy = Math.min(player.vy + gravity * dt, LADDER_SLIDE_SPEED);
  } else if (!inWater) {
    // A little gentler on the way down, so falls aren't so sudden (jumps stay the same).
    player.vy += gravity * (player.vy > 0 ? 0.85 : 1) * dt;
  }

  const baseMaxFall = inWater ? SWIM_DIVE_SPEED * 1.5 : player.maxFallSpeed;
  const maxFallSpeed = gravityMult < 1 ? baseMaxFall * Math.sqrt(gravityMult) : baseMaxFall;
  if (player.vy > maxFallSpeed) player.vy = maxFallSpeed;

  let nextX = player.x + player.vx * dt;

  if (!noClipMode) {
    nextX = sweepX(world, player, nextX, true);
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
        Math.floor(feetRightX / TILE_SIZE),
        Math.floor((player.x + EDGE_EPS) / TILE_SIZE),
        Math.floor((player.x + player.width - EDGE_EPS) / TILE_SIZE)
      ];
      // Check every row the feet pass through this frame, so a fast fall can't skip a
      // thin trapdoor. Rows passed over only count surfaces we were above.
      const oldBottom = player.y + player.height;
      const lastRow = Math.floor((newBottom - EDGE_EPS) / TILE_SIZE);
      for (let footTileY = Math.floor((oldBottom - EDGE_EPS) / TILE_SIZE); footTileY <= lastRow; footTileY++) {
        let minSurface = null;
        for (const tx of footTilesX) {
          const localLeft = (feetLeftX - tx * TILE_SIZE) / TILE_SIZE;
          const localRight = (feetRightX - tx * TILE_SIZE) / TILE_SIZE;
          const box = solidBox(world, tx, footTileY);
          let s;
          if (box && isStrip(box)) s = box.right > feetLeftX && box.left < feetRightX ? box.top : null;
          else {
            const s1 = topSurfaceY(world, tx, footTileY, localLeft);
            const s2 = topSurfaceY(world, tx, footTileY, localRight);
            s = s1 !== null && s2 !== null ? Math.min(s1, s2) : (s1 ?? s2);
          }
          if (s !== null) {
            if (minSurface === null || s < minSurface) minSurface = s;
          }
        }
        if (
          minSurface !== null &&
          newBottom >= minSurface &&
          (footTileY === lastRow ? minSurface >= oldBottom - TILE_SIZE / 2 : minSurface >= oldBottom - 0.5)
        ) {
          // (Never snap up onto something far above the feet, like a plank at head height.)
          nextY = minSurface - player.height;
          player.vy = 0;
          player.onGround = true;
          if (!wasOnGround) player.land?.();
          break;
        }
      }
      // Feet slip past ledges by a few pixels, but the body mustn't drop deep into a block
      // beside them: slide off it sideways, or land on it if there's no room to.
      if (!player.onGround) {
        const l = Math.floor((player.x + EDGE_EPS) / TILE_SIZE),
          r = Math.floor((player.x + player.width - EDGE_EPS) / TILE_SIZE);
        const t = Math.floor((oldBottom - EDGE_EPS) / TILE_SIZE),
          b = Math.floor((nextY + player.height - EDGE_EPS) / TILE_SIZE);
        for (let tx = l; tx <= r; tx++) {
          for (let ty = t; ty <= b; ty++) {
            const box = solidBox(world, tx, ty);
            if (!box || box.top < oldBottom - 0.5 || box.top >= nextY + player.height) continue;
            // Just walked off this ledge (only the few px the feet may hang over overlap):
            // fall straight down past it rather than snapping sideways.
            const overlap = Math.min(box.right, player.x + player.width) - Math.max(box.left, player.x);
            if (overlap <= 0 || overlap <= FEET_INSET + 0.5) continue;
            const outLeft = box.left - player.width - 0.01,
              outRight = box.right + 0.01;
            const toX = Math.abs(outLeft - player.x) < Math.abs(outRight - player.x) ? outLeft : outRight;
            if (!boxBlocked(world, toX, nextY, player)) player.x = toX;
            else {
              nextY = box.top - player.height;
              player.vy = 0;
              player.onGround = true;
              if (!wasOnGround) player.land?.();
            }
          }
        }
      }
    }

    if (goingUp) {
      const headY = nextY;
      const leftTileX = Math.floor(player.x / TILE_SIZE);
      const rightTileX = Math.floor((player.x + player.width - EDGE_EPS) / TILE_SIZE);
      // Every row the head passes through this frame (nearest first), so a jump can't
      // skip through a thin trapdoor. Rows passed over only count ceilings we were below.
      const firstRow = Math.floor(player.y / TILE_SIZE);
      let hitCeiling = false;
      for (let headTilesY = firstRow; headTilesY >= Math.floor(headY / TILE_SIZE) && !hitCeiling; headTilesY--)
        for (let tx = leftTileX; tx <= rightTileX; tx++) {
          const localLeft = (player.x - tx * TILE_SIZE) / TILE_SIZE;
          const localRight = (player.x + player.width - EDGE_EPS - tx * TILE_SIZE) / TILE_SIZE;
          const box = solidBox(world, tx, headTilesY);
          let ceilY;
          if (box && isStrip(box)) ceilY = box.right > player.x && box.left < player.x + player.width ? box.bottom : null;
          else {
            const c1 = ceilingSurfaceY(world, tx, headTilesY, localLeft);
            const c2 = ceilingSurfaceY(world, tx, headTilesY, localRight);
            ceilY = c1 !== null && c2 !== null ? Math.min(c1, c2) : (c1 ?? c2);
          }
          if (ceilY !== null && headY <= ceilY && (headTilesY === Math.floor(headY / TILE_SIZE) || ceilY <= player.y + 0.5)) {
            // A bump never pushes you down (into the ground) if your head is already level
            // with or past the ceiling, e.g. under a trapdoor that swung over you.
            nextY = Math.min(ceilY + 0.01, player.y);
            player.vy = 0;
            hitCeiling = true;
            break;
          }
        }
    }
  }

  player.y = nextY;
  if (inWater || onLadder) player.cancelFall?.();
  else if (player.onGround) player.land?.();
  else player.trackFall?.();
}
