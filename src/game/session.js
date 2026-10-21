// Playing in a world: loading chunks, teleporting, moving between dimensions, saving.
import { ItemEntity } from '../entities/item.js';
import { sampleBlockAt } from '../logic/terrainGen.js';
import { TILE_SIZE } from '../core/utils.js';
import { getDimension, resolveDimensionId, findClosestSafeSpot } from '../core/dimensions.js';
import { LeafParticle } from '../entities/leaf_particle.js';
import { registry } from './content.js';
import { multiplayer } from './net.js';
import { setPlayerColor } from './players.js';
import { recomputeCraft, dropStackAtPlayer } from '../ui/inventoryUI.js';
import { game, leafParticles, tpVisited, saveManager } from './state.js';
import { commandOk, commandFail } from './commands.js';
import { spawnItemEntity, handleBrokenBlock } from './entities.js';

function restoreSavedEntities(chunkX) {
  if (!game.world) return;
  for (const s of game.world.fetchSavedEntitiesForChunk(chunkX)) {
    const it = new ItemEntity(s.blockId, s.x, s.y, game.world.time);
    it.vx = s.vx ?? 0;
    it.vy = s.vy ?? 0;
    it.life = s.life ?? 0;
    it.age = s.age ?? 0;
    it.count = s.count || 1;
    game.items.push(it);
  }
}

export function findSurfaceY(tileX) {
  for (let y = 0; y < game.world.height; y++) {
    const id = game.world.isChunkLoaded(game.world.chunkXFor(tileX))
      ? game.world.getBlockId(tileX, y)
      : sampleBlockAt(
          tileX,
          y,
          game.world.seed ?? 0,
          game.world.height,
          game.world.width,
          game.world.worldType || 'regular',
          game.world.superflatLayers || null
        ).id;
    const type = registry.get(id);
    if (type && type.solid) return y;
  }
  return Math.floor(game.world.height / 2);
}

export function placePlayerAtSurface(tileX) {
  const surfaceY = findSurfaceY(tileX);
  game.player.x = tileX * TILE_SIZE + (TILE_SIZE - game.player.width) / 2;
  game.player.y = surfaceY * TILE_SIZE - game.player.height - 1;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.onGround = false;
  game.player.cancelFall();
  ensurePlayerNotInSolid();
  game.player.spawnPoint = { x: game.player.x, y: game.player.y };
}

// Chunks loaded each side of the player: the render distance, or more when zoomed out
// far enough to see past it, so the screen is always filled.
function loadDistance() {
  const base = Math.max(0, Math.floor(game.chunkRenderDistance));
  if (!game.camera || !game.canvas || !game.world) return base;
  const halfTiles = game.canvas.width / (TILE_SIZE * game.camera.zoom) / 2;
  return Math.max(base, Math.ceil(halfTiles / game.world.chunkSize) + 1);
}

export async function loadInitialChunks(originX) {
  const centerChunk = Math.floor(originX / game.world.chunkSize);
  const dist = loadDistance() + 1;
  const minChunk = Math.max(0, centerChunk - dist);
  const maxChunk = Math.min(Math.floor((game.world.width - 1) / game.world.chunkSize), centerChunk + dist);
  const loads = [];
  for (let cx = minChunk; cx <= maxChunk; cx++) {
    loads.push(
      game.world
        .loadChunkAsync(cx)
        .then(() => restoreSavedEntities(cx))
        .catch(() => {})
    );
  }
  await Promise.all(loads);
}

// Loads the chunks around tileX like loadInitialChunks, showing the loading screen while
// any of them still has to be made (rather than the world being built up on screen); then
// `place` puts the player there and the camera jumps to them.
function chunksMissingAround(tileX) {
  const world = game.world;
  const dist = loadDistance() + 1;
  const center = Math.floor(tileX / world.chunkSize);
  const last = Math.floor((world.width - 1) / world.chunkSize);
  for (let cx = Math.max(0, center - dist); cx <= Math.min(last, center + dist); cx++) if (!world.isChunkLoaded(cx)) return true;
  return false;
}

export async function loadAroundWithScreen(tileX, place) {
  const missing = chunksMissingAround(tileX);
  if (missing) {
    game.isLoading = true;
    game.renderer.render();
  }
  try {
    await loadInitialChunks(tileX);
    place?.();
    const head = game.player.getHeadAnchor();
    game.camera.followTo(head.x, head.y, game.canvas, game.world);
  } finally {
    if (missing) game.isLoading = false;
  }
}

export function ensurePlayerNotInSolid() {
  if (!game.player) return;
  for (let i = 0; i < 40; i++) {
    const left = Math.floor(game.player.x / TILE_SIZE);
    const right = Math.floor((game.player.x + game.player.width - 1) / TILE_SIZE);
    const top = Math.floor(game.player.y / TILE_SIZE);
    const bottom = Math.floor((game.player.y + game.player.height - 1) / TILE_SIZE);
    let blocked = false;
    for (let tx = left; tx <= right && !blocked; tx++) {
      for (let ty = top; ty <= bottom; ty++) {
        if (game.world.inBounds(tx, ty) && game.world.isSolidAt(tx, ty)) {
          blocked = true;
          break;
        }
      }
    }
    if (!blocked) return;
    game.player.y -= TILE_SIZE;
    game.player.vy = 0;
  }
}

export function applyPlayerAction(a) {
  if (!game.world || !game.player) return;
  switch (a.k) {
    case 'clear':
      // Everything you carry: inventory, the stack in your hand and the 2x2 crafting grid.
      game.inventory.clear();
      game.draggingStack = null;
      game.inventoryCraftGrid.fill(null);
      recomputeCraft();
      if (multiplayer.isGuest) multiplayer.sendGuestSave();
      break;
    case 'give':
      giveById(a.id, a.n);
      break;
    case 'mode':
      setCreativeMode(a.c == null ? !game.creativeMode : !!a.c);
      break;
    case 'tp':
      teleportPlayerTo(a.x, a.y);
      break;
    case 'fly':
      setFlying(a.on);
      break;
    case 'noclip':
      setNoClip(a.on);
      break;
    case 'effect':
      setEffect(a.name);
      break;
    case 'color':
      setPlayerColor(a.c);
      break;
    case 'kill':
      game.player?.die();
      break;
    case 'hit':
      hurtPlayer(a.dmg, a.vx, a.vy);
      break;
  }
}

// on: true / false, or null to flip.
function setFlying(on) {
  const flying = on == null ? !game.player.creativeFlying : !!on;
  if (flying && !game.creativeMode) setCreativeMode(true);
  game.player.creativeFlying = flying;
  game.player.isFlying = flying;
  if (!flying) game.player.vy = 0;
}

function setNoClip(on) {
  // Flipping it while it's still on from before but you've stopped flying: back into noclip.
  if (on == null) on = !(game.noClipMode && game.player.creativeFlying);
  game.noClipMode = !!on;
  if (game.noClipMode && !game.creativeMode) setCreativeMode(true);
  if (game.noClipMode) {
    game.player.creativeFlying = true;
    game.player.isFlying = true;
  }
}

function setEffect(name) {
  if (name === 'clear') game.renderer.effects = {};
  else if (name === 'light') (game.renderer.effects ??= {}).light = true;
}

export function teleportPlayerTo(px, py) {
  game.player.x = px;
  game.player.y = py;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.onGround = false;
  game.player.cancelFall();
  game.lastPreloadChunk = null;
  return loadAroundWithScreen(Math.floor(game.player.x / TILE_SIZE), ensurePlayerNotInSolid);
}

export async function teleportToDimension(targetDimId, customX = null, customY = null) {
  if (!game.world || !game.player) return false;
  const dimId = resolveDimensionId(targetDimId);
  const dimDef = getDimension(dimId);
  if (!dimDef) {
    commandFail(`Unknown world or dimension "${targetDimId}".`);
    return false;
  }

  const currentDimId = game.world.dimensionId || 'earth';
  const targetTileX = customX !== null ? Math.floor(customX) : Math.floor(game.player.x / TILE_SIZE);
  const targetTileY = customY !== null ? Math.floor(customY) : null;

  const switchingDim = currentDimId !== dimDef.id;
  if (switchingDim && multiplayer.active) {
    // The other players' games only have this world, so everyone stays in it.
    commandFail("You can't travel to other worlds in a multiplayer game.");
    return false;
  }
  if (switchingDim || chunksMissingAround(targetTileX)) {
    game.isLoading = true;
    game.renderer.render();
    // Allow the browser to paint the loading frame before heavy chunk generation
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  try {
    if (switchingDim) {
      game.breaker.cancel();
      tpVisited.clear();
      leafParticles.length = 0;
      enterWorld(game.dimensionManager.getOrCreateDimension(dimDef.id), game.world);
      saveManager.markDirty();
    }

    // Preload chunks at the target coordinates in the new world
    game.lastPreloadChunk = null;
    await loadInitialChunks(targetTileX);

    // Find the closest safe block to the player's coordinates
    const safeSpot = findClosestSafeSpot(game.world, targetTileX, targetTileY);

    // Safely place the player on top of the solid block at (safeSpot.x, safeSpot.y)
    game.player.x = safeSpot.x * TILE_SIZE + Math.floor((TILE_SIZE - game.player.width) / 2);
    game.player.y = (safeSpot.y + 1) * TILE_SIZE - game.player.height;
    game.player.vx = 0;
    game.player.vy = 0;
    game.player.onGround = true;
    game.player.cancelFall();
    ensurePlayerNotInSolid();

    // Point camera at player's new position
    const head = game.player.getHeadAnchor();
    game.camera.followTo(head.x, head.y, game.canvas, game.world);

    commandOk(`Teleported you to ${dimDef.displayName} at ${safeSpot.x}, ${safeSpot.y}.`);
    return true;
  } finally {
    game.isLoading = false;
    game.renderer.render();
  }
}

// Hooks a world (Earth or another dimension) up to the game: saving, multiplayer, falling
// leaves and how many chunks it keeps loaded.
export function wireWorld(w) {
  w.items ??= [];
  w.maxLoadedChunks = Math.max(30, (game.chunkRenderDistance + 2) * 2 + 1);
  w.onBlockChanged = (x, y) => {
    saveManager.markDirty();
    multiplayer.onCellChanged(x, y);
  };
  // A plant torn out by a gale breaks like a mined one, and what it drops is flung downwind.
  w.onPlantUprooted = (broke) => handleBrokenBlock(broke);
  // Decaying leaves drop their block as an item and drift down as a falling leaf particle.
  w.onLeafDecayed = (leafId, x, y) => {
    const centerX = (x + 0.5) * TILE_SIZE;
    const centerY = (y + 0.5) * TILE_SIZE;
    spawnItemEntity(leafId, centerX, centerY, 1, (Math.random() - 0.5) * 1.5, -0.8 - Math.random() * 0.6);
    if (!game.renderFallingLeaves || leafParticles.length > 90) return;
    const n = registry.get(leafId)?.leaves?.fallOnDecay ?? 1;
    for (let i = 0; i < n; i++) leafParticles.push(new LeafParticle(leafId, centerX, centerY, w.time, 0.7 + Math.random() * 0.4));
  };
}

// Moves the player into another dimension's world. The session's settings (game mode,
// commands, difficulty...) come along from the world they were in.
export function enterWorld(target, from) {
  wireWorld(target);
  for (const key of ['creativeMode', 'cheatsEnabled', 'allowCommands', 'difficulty', 'mpPlayers']) target[key] = from[key];
  game.world = target;
  game.items = game.world.items;
  if (game.player) game.player.world = game.world;
  game.renderer.world = game.world;
  game.dimensionManager.activeDimensionId = game.world.dimensionId;
  game.lastPreloadChunk = null;
}

function setCreativeMode(enabled) {
  game.creativeMode = enabled;
  game.world.creativeMode = enabled;
  game.player.fallDamageEnabled = !enabled;
  game.creativeCategoriesCache = null;
  if (!enabled) {
    game.player.creativeFlying = false;
    game.player.isFlying = false;
  }
}

function giveById(id, amount) {
  if (!registry.has(id) || id === 'air' || id === 'water') return;
  const leftover = game.inventory.addById(id, amount);
  if (leftover > 0) dropStackAtPlayer({ type: registry.isItem(id) ? 'item' : 'block', blockId: id, itemId: id }, leftover);
}

export function getSessionMeta() {
  return {
    gameMode: game.worldGameMode,
    creativeMode: game.creativeMode,
    selectedIndex: game.selectedIndex,
    currentSeed: game.currentSeed,
    displayName: game.currentWorldDisplayName || game.currentWorldSaveName
  };
}

export function getSaveState() {
  if (!game.world || !game.player || !game.currentWorldSaveName) return null;
  return { world: game.world, player: game.player, items: game.items, inventory: game.inventory, meta: getSessionMeta() };
}

export function saveCurrentWorld() {
  const state = getSaveState();
  if (!state) return Promise.resolve(false);
  return saveManager.save(state.world, state.player, state.items, state.inventory, state.meta);
}

// Hurt by another player.
function hurtPlayer(dmg, vx, vy) {
  if (!game.player) return;
  game.player.vx += vx || 0;
  game.player.vy += vy || 0;
  game.player.takeDamage(dmg);
}

export function preloadChunksAroundPlayer() {
  const now = Date.now();
  if (now - game.lastPreloadTime < 150) return;
  game.lastPreloadTime = now;

  const centerChunk = Math.floor((game.player.x + game.player.width / 2) / TILE_SIZE / game.world.chunkSize);
  // A multiplayer host also keeps the chunks around each guest loaded and running.
  const guestCenters = multiplayer.keepChunkCenters();
  // Where the camera is looking, when that's somewhere else (/camera position, watching a player).
  const camChunk = game.camera ? Math.floor(game.camera.centerX / TILE_SIZE / game.world.chunkSize) : centerChunk;
  const camAway = Math.abs(camChunk - centerChunk) > loadDistance();
  const signature = centerChunk + '|' + guestCenters.join(',') + '|' + (camAway ? camChunk : '');
  if (game.lastPreloadChunk === signature) return;
  game.lastPreloadChunk = signature;

  const lastChunk = Math.floor((game.world.width - 1) / game.world.chunkSize);
  const dist = loadDistance();
  const keepMin = Math.max(0, centerChunk - dist - 1);
  const keepMax = Math.min(lastChunk, centerChunk + dist + 1);
  const ranges = [[keepMin, keepMax]];
  for (const gc of guestCenters) {
    ranges.push([Math.max(0, gc - multiplayer.keepRadius()), Math.min(lastChunk, gc + multiplayer.keepRadius())]);
  }
  if (camAway) ranges.push([Math.max(0, camChunk - dist - 1), Math.min(lastChunk, camChunk + dist + 1)]);
  const keep = (cx) => ranges.some(([a, b]) => cx >= a && cx <= b);
  game.world.maxLoadedChunks = Math.max(30, (loadDistance() + 2) * 2 + 1) * (camAway ? 2 : 1) + guestCenters.length * (multiplayer.keepRadius() * 2 + 1);

  for (const key of Array.from(game.world.chunks.keys())) {
    const cx = parseInt(key, 10);
    if (!keep(cx)) game.world.unloadChunk(cx);
  }

  const chunksToLoad = [];
  for (const [a, b] of ranges) {
    for (let cx = a; cx <= b; cx++) {
      if (!game.world.isChunkLoaded(cx) && !chunksToLoad.includes(cx)) chunksToLoad.push(cx);
    }
  }
  chunksToLoad.sort((a, b) => Math.abs(a - centerChunk) - Math.abs(b - centerChunk));
  const targetWorld = game.world;
  for (const cx of chunksToLoad) {
    game.world
      .loadChunkAsync(cx)
      .then(() => {
        if (game.world === targetWorld) restoreSavedEntities(cx);
      })
      .catch(() => {});
  }
}
