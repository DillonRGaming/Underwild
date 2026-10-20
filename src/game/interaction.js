// Using the world with the mouse: placing blocks, buckets, hitting players, reach.
import { TILE_SIZE, rectsOverlap } from '../core/utils.js';
import { canCombineSlab } from '../../assets/blocks/double_slab.js';
import { multiplayer } from './net.js';
import { registry, isPlantBlock } from './content.js';
import { dropStackAtPlayer } from '../ui/inventoryUI.js';
import { keybinds } from './settings.js';
import { burstLeaves } from './entities.js';
import { game } from './state.js';

const PLACE_REPEAT_MS = 200;

export function getMouseTileFromRaw(screenX, screenY) {
  const worldX = game.camera.screenToWorldX(screenX);
  const worldY = game.camera.screenToWorldY(screenY);

  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);

  return { worldX, worldY, tileX, tileY };
}

export function getScreenCoordsFromEvent(e) {
  return {
    screenX: e.offsetX * (game.canvas.width / game.canvas.clientWidth),
    screenY: e.offsetY * (game.canvas.height / game.canvas.clientHeight)
  };
}

const HIT_REACH = 4; // blocks

const HIT_COOLDOWN_MS = 400;

// Multiplayer: a left click on another player hits them (harder with a sword).
export function tryHitPlayer(screenX, screenY) {
  if (multiplayer.remotePlayers.size === 0) return false;
  const wx = game.camera.screenToWorldX(screenX);
  const wy = game.camera.screenToWorldY(screenY);
  const now = performance.now();
  for (const rp of multiplayer.remotePlayers.values()) {
    if (wx < rp.x - 2 || wx > rp.x + rp.width + 2 || wy < rp.y - 2 || wy > rp.y + rp.height + 2) continue;
    const dist = Math.hypot(rp.x - game.player.x, rp.y - game.player.y) / TILE_SIZE;
    if (dist > HIT_REACH) return true;
    if (now - game.lastHitTime < HIT_COOLDOWN_MS) return true;
    game.lastHitTime = now;
    const held = game.inventory.getSlot(game.selectedIndex);
    const heldType = held?.type === 'item' ? registry.get(held.itemId) : null;
    const dmg = heldType?.toolType === 'sword' ? 2 + Math.round(heldType.materialMultiplier || 1) : heldType?.type === 'tool' ? 2 : 1;
    const dir = rp.x + rp.width / 2 > game.player.x + game.player.width / 2 ? 1 : -1;
    multiplayer.sendAction(rp.id, { k: 'hit', dmg, vx: dir * 260, vy: -180 });
    rp.hurtAt = now;
    game.player.playArmAction('attack');
    return true;
  }
  return false;
}

// Buckets: an empty bucket scoops a full block of water; a water bucket pours it back out.
export function useBucket(tileX, tileY) {
  const hotSlot = game.inventory.getSlot(game.selectedIndex);
  const held = hotSlot?.type === 'item' ? hotSlot.itemId : null;
  if ((held !== 'bucket' && held !== 'water_bucket') || !game.world.inBounds(tileX, tileY)) return false;
  const sim = game.world.water;
  if (held === 'bucket') {
    // A bucket scoops a full block's worth from the water at the clicked block, nearest first.
    const took = sim.take(tileX, tileY);
    if (took === 'none') return false;
    if (took !== 'taken') return true;
    multiplayer.sendBucket('take', tileX, tileY);
    // In creative the empty bucket stays and a new water bucket is added each time.
    if (!game.creativeMode) hotSlot.count -= 1;
    if (hotSlot.count <= 0) game.inventory.setSlot(game.selectedIndex, { type: 'item', itemId: 'water_bucket', count: 1 });
    else {
      const leftover = game.inventory.addItem('water_bucket', 1);
      if (leftover > 0) dropStackAtPlayer({ type: 'item', itemId: 'water_bucket' }, leftover);
    }
    game.player.playArmAction('place');
    return true;
  }
  // Pour: a full block of water into the clicked block (spilling into the one above if it's
  // part full). Plants there are washed away.
  const id = game.world.getBlockId(tileX, tileY);
  const cell = game.world.getCell(tileX, tileY);
  if (id !== 'air' && !isPlantBlock(id) && cell.meta?.layer !== 'bg' && game.world.isSolidAt(tileX, tileY)) return true;
  if (isPlantBlock(id)) game.world.setBlock(tileX, tileY, 'air', null);
  if (!sim.pour(tileX, tileY)) return true;
  multiplayer.sendBucket('pour', tileX, tileY);
  if (!game.creativeMode) game.inventory.setSlot(game.selectedIndex, { type: 'item', itemId: 'bucket', count: 1 });
  game.player.playArmAction('place');
  return true;
}

export function tryPlaceBlockAt(screenX, screenY, isRepeat = false) {
  const { worldX, worldY } = getMouseTileFromRaw(screenX, screenY);
  const { tileX, tileY } = getMouseTileFromRaw(screenX, screenY);
  const clickedId = game.world.getBlockId(tileX, tileY);
  const hotSlot = game.inventory.getSlot(game.selectedIndex);
  if (!hotSlot || hotSlot.type !== 'block' || !game.world.inBounds(tileX, tileY)) return;
  if (!multiplayer.canBuild() || !inReach(tileX, tileY)) return;

  // A slab placed onto a slab fills the other half: the two become one full double slab.
  const cell = game.world.getCell(tileX, tileY);
  if (
    !game.backgroundBuild &&
    !isRepeat &&
    cell.meta?.layer !== 'bg' &&
    canCombineSlab(registry.get(clickedId)) &&
    canCombineSlab(registry.get(hotSlot.blockId))
  ) {
    if (rectsOverlap(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE, game.player.x, game.player.y, game.player.width, game.player.height)) return;
    const lower = (cell.meta?.slabPos || 'bottom') === 'bottom';
    const top = lower ? hotSlot.blockId : clickedId;
    game.world.setBlock(tileX, tileY, 'double_slab', {
      bottom: lower ? clickedId : hotSlot.blockId,
      top,
      ...(registry.get(top)?.grassy ? { grassy: true } : {})
    });
    game.world.updateLighting(tileX, tileY);
    game.player.playArmAction('place');
    if (!game.creativeMode) {
      hotSlot.count -= 1;
      if (hotSlot.count <= 0) game.inventory.setSlot(game.selectedIndex, null);
    }
    return;
  }

  // In creative, placing on a block swaps it for the held one.
  const clickedType = registry.get(clickedId);
  const open =
    clickedId === 'air' ||
    clickedId === 'water' ||
    isPlantBlock(clickedId) ||
    cell.meta?.layer === 'bg' ||
    (game.backgroundBuild && (!clickedType?.solid || (clickedType?.shape && clickedType.shape !== 'full')));
  const replace = game.creativeMode && !game.backgroundBuild && !open && clickedId !== hotSlot.blockId;
  if (!open && !replace) return;
  if (replace && isRepeat) return;

  const hotType = registry.get(hotSlot.blockId);
  const isSolid = hotType && hotType.solid !== false && (typeof hotType.isSolid !== 'function' || hotType.isSolid());
  if (isSolid && !game.backgroundBuild && !hotType?.climbable) {
    if (hotType.shape === 'slab') {
      const localY = worldY - tileY * TILE_SIZE;
      const top = game.input.isKeyDown(keybinds.flip) ? localY >= TILE_SIZE / 2 : localY < TILE_SIZE / 2;
      const slabY = top ? tileY * TILE_SIZE : tileY * TILE_SIZE + TILE_SIZE / 2;
      if (rectsOverlap(tileX * TILE_SIZE, slabY, TILE_SIZE, TILE_SIZE / 2, game.player.x, game.player.y, game.player.width, game.player.height)) return;
    } else if (rectsOverlap(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE, game.player.x, game.player.y, game.player.width, game.player.height)) {
      return;
    }
  }

  const placed = game.placer.place(game.world, { type: 'block', blockId: hotSlot.blockId }, tileX, tileY, {
    mouseWorldX: worldX,
    mouseWorldY: worldY,
    modifierFlip: game.input.isKeyDown(keybinds.flip),
    rotate: game.input.isKeyDown(keybinds.rotate),
    facing: worldX > game.player.x + game.player.width / 2 ? 1 : -1, // the way the player is drawn facing (toward the mouse)
    background: game.backgroundBuild,
    hasWall: !!game.renderer.naturalWallId(tileX, tileY) || cell?.meta?.layer === 'bg' || !!cell?.meta?.bgId,
    anywhere: game.creativeMode,
    replace
  });
  if (placed) game.player.playArmAction('place');
  const placedLeaves = registry.get(hotSlot.blockId)?.leaves;
  if (placed && placedLeaves) burstLeaves(hotSlot.blockId, tileX, tileY, Math.random() < placedLeaves.fallOnPlace ? 1 : 0);
  if (placed && !game.creativeMode) {
    hotSlot.count -= 1;
    if (hotSlot.count <= 0) game.inventory.setSlot(game.selectedIndex, null);
  }
}

// Survival players reach this many blocks; creative reaches anywhere on screen (the touch aim
// stick goes out CREATIVE_TOUCH_REACH blocks).
export const SURVIVAL_REACH = 10;

export const CREATIVE_TOUCH_REACH = 12;

export function inReach(tileX, tileY) {
  if (game.creativeMode) return true;
  const dx = (tileX + 0.5) * TILE_SIZE - (game.player.x + game.player.width / 2);
  const dy = (tileY + 0.5) * TILE_SIZE - (game.player.y + game.player.height / 2);
  return Math.hypot(dx, dy) <= SURVIVAL_REACH * TILE_SIZE;
}

// Whether the held block could be placed in this empty cell (for the hover outline).
export function canPlaceAt(tileX, tileY) {
  const slot = game.inventory.getSlot(game.selectedIndex);
  if (!slot || slot.type !== 'block' || !inReach(tileX, tileY) || !multiplayer.canBuild()) return false;
  if (game.creativeMode || game.backgroundBuild) return true;
  const cell = game.world.getCell(tileX, tileY);
  const hasWall = !!game.renderer.naturalWallId(tileX, tileY) || cell?.meta?.layer === 'bg' || !!cell?.meta?.bgId;
  if (hasWall) return true;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]) {
    if (game.world.inBounds(tileX + dx, tileY + dy) && game.world.isSolidAt(tileX + dx, tileY + dy)) return true;
  }
  const type = registry.get(slot.blockId);
  if (type?.kind === 'trapdoor') {
    return [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ].some(([dx, dy]) => game.world.inBounds(tileX + dx, tileY + dy) && game.world.getBlockId(tileX + dx, tileY + dy) !== 'air');
  }
  return false;
}

export function updateHeldPlacement(uiOpen) {
  if (!game.input.mouse.rightDown || uiOpen) {
    game.placeHeld = false;
    return;
  }
  if (!game.placeHeld) return;
  const now = performance.now();
  if (now - game.lastPlaceTime < PLACE_REPEAT_MS) return;
  game.lastPlaceTime = now;
  tryPlaceBlockAt(game.input.mouse.x, game.input.mouse.y, true);
}
