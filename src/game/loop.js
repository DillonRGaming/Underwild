// The game loop: fixed game ticks, the per-frame update, and the menu's render loop.
import { gameClock } from '../core/gameClock.js';
import { wind } from '../core/wind.js';
import { weather } from '../core/weather.js';
import { perf } from '../core/perf.js';
import { Engine } from '../core/engine.js';
import { TILE_SIZE } from '../core/utils.js';
import { game, leafParticles, explosionFX, primedExplosives } from './state.js';
import { keybinds } from './settings.js';
import { SURVIVAL_REACH, canPlaceAt, inReach, updateHeldPlacement } from './interaction.js';
import { updateEntities, handleBrokenBlock } from './entities.js';
import { multiplayer } from './net.js';
import { registry, isChest } from './content.js';
import { throwSelectedBlock, closeInventory, updateHTMLUI } from '../ui/inventoryUI.js';
import { preloadChunksAroundPlayer } from './session.js';

const DROP_REPEAT_MS = 150;

// The menus (and the loading screen) are drawn by this loop while the game engine isn't
// running; it stops itself once the engine starts and is restarted when the engine stops.
// Carries out a /time that is still on its way: moves every world's clock on by its share of
// the distance left.
function glideTime(dt) {
  const glide = game.timeGlide;
  if (!glide) return;
  const step = Math.min(glide.left, glide.rate * dt);
  glide.left -= step;
  const worlds = [game.world, ...(game.dimensionManager?.dimensions.values() || [])];
  for (const w of new Set(worlds)) if (w) w.time = (w.time + step) % (w.dayLength || game.world.dayLength);
  if (glide.left <= 0) game.timeGlide = null;
}

export function startMenuLoop() {
  if (game.menuLoopRunning) return;
  game.menuLoopRunning = true;
  requestAnimationFrame(menuRenderLoop);
}

function menuRenderLoop() {
  if (game.engine?.running) {
    game.menuLoopRunning = false;
    return;
  }
  try {
    game.renderer.render();
  } catch (renderError) {
    console.error('Render error in menu loop:', renderError);
  }
  requestAnimationFrame(menuRenderLoop);
}

const inThisWorld = (spot) => (spot && (spot.dim ?? 'earth') === (game.world?.dimensionId || 'earth') ? spot : null);

export function getRendererUI() {
  return {
    selectedIndex: game.selectedIndex,
    inventoryOpen: game.inventoryOpen,
    openContainer: game.openContainer,
    draggingStack: game.draggingStack,
    craftGrid: game.craftGrid,
    inventoryCraftGrid: game.inventoryCraftGrid,
    craftOutput: game.craftOutput,
    creativeMode: game.creativeMode,
    creativeTab: game.creativeTab,
    textInputMode: game.textInputMode,
    items: game.items,
    leafParticles,
    explosionFX,
    primedExplosives,
    backgroundBlocks: game.backgroundBlocks,
    keybinds,
    // Tap mode on phones has no cursor, so no outline under it either.
    showOutline: game.showOutline && !document.body.classList.contains('touch-tap-mode'),
    canPlaceAt,
    reach: game.creativeMode ? 64 : SURVIVAL_REACH,
    // Marked corners only show in the world they were set in.
    setPosition1: inThisWorld(game.setPosition1),
    setPosition2: inThisWorld(game.setPosition2),
    isLoading: game.isLoading,
    gamePaused: game.gamePaused,
    renderFallingLeaves: game.renderFallingLeaves
  };
}

// The world runs in fixed ticks of game time; the tick speed sets how many run per real
// second, so at any speed everything (day, entities, blocks, furnaces, water, wind, clouds)
// moves exactly as far per tick as it does at speed 1. Very high speeds are capped per frame.
const GAME_TICK = 1 / 60;

const MAX_TICKS_PER_FRAME = 400;

function runGameTicks(dt) {
  const clampedDt = Math.min(dt, 0.25);
  game.tickAccum += clampedDt * game.gameSpeed;
  const n = Math.floor(game.tickAccum / GAME_TICK);
  game.tickAccum -= n * GAME_TICK;
  if (n <= 0) return;

  // If gameSpeed is extremely high, run up to max allowed detailed physics/entity ticks,
  // and step remaining accumulated time directly so time/celestial bodies/daylight move super fast
  // without dropping frame rate to a crawl. Under 1x speed, clamp to 5 ticks max to prevent frame hitches.
  const maxTicks = game.gameSpeed > 1 ? Math.min(MAX_TICKS_PER_FRAME, Math.ceil(game.gameSpeed * 5)) : 5;
  const stepTicks = Math.min(n, maxTicks);
  const excessTicks = n - stepTicks;

  for (let i = 0; i < stepTicks; i++) {
    gameClock.ms += GAME_TICK * 1000;
    wind.tick(GAME_TICK);
    weather.tick(GAME_TICK);
    glideTime(GAME_TICK);
    if (!game.world.timeManuallySet) game.world.time += GAME_TICK;
    perf.startPhase('tickEntities');
    updateEntities();
    perf.endPhase('tickEntities');
    perf.startPhase('tickWorld');
    game.world.tick(GAME_TICK);
    if (game.dimensionManager) game.dimensionManager.tick(GAME_TICK);
    perf.endPhase('tickWorld');
  }

  if (excessTicks > 0) {
    const excessSeconds = excessTicks * GAME_TICK;
    gameClock.ms += excessSeconds * 1000;
    wind.tick(excessSeconds);
    weather.tick(excessSeconds);
    glideTime(excessSeconds);
    if (!game.world.timeManuallySet) game.world.time += excessSeconds;
    if (game.dimensionManager) game.dimensionManager.tick(excessSeconds);
  }
}

export function initializeGameEngine() {
  const updateFunction = (dt, time) => {
    if (!game.world || !game.player) return;
    perf.startPhase('updateTotal');
    try {
      if (game.gamePaused && !multiplayer.active) {
        perf.startPhase('updateUI');
        updateHTMLUI();
        perf.endPhase('updateUI');
        return;
      }
      // In multiplayer the world keeps going for everyone while your pause menu is open.
      if (game.gamePaused) {
        game.player.inputLocked = true;
        perf.startPhase('updatePlayer');
        game.player.update(game.input, dt, time, game.noClipMode, game.creativeMode);
        perf.endPhase('updatePlayer');
        game.breaker.cancel();
        perf.startPhase('updateTicks');
        runGameTicks(dt);
        perf.endPhase('updateTicks');
        perf.startPhase('updateMultiplayer');
        multiplayer.update(dt);
        perf.endPhase('updateMultiplayer');
        perf.startPhase('updateChunks');
        preloadChunksAroundPlayer();
        perf.endPhase('updateChunks');
        perf.startPhase('updateUI');
        updateHTMLUI();
        perf.endPhase('updateUI');
        return;
      }

      game.player.inputLocked = game.textInputMode;
      game.player.autoJump = game.autoJump;
      perf.startPhase('updatePlayer');
      game.player.update(game.input, dt, time, game.noClipMode, game.creativeMode);
      perf.endPhase('updatePlayer');

      if (game.isDropKeyHeld && !game.inventoryOpen && !game.openContainer) {
        const now = performance.now();
        if (now - game.lastDropTime >= DROP_REPEAT_MS) {
          throwSelectedBlock();
          game.lastDropTime = now;
        }
      }

      const uiOpen = game.inventoryOpen || !!game.openContainer || game.textInputMode;
      const mouseActive = (game.input.mouse.leftDown || game.input.mouse.rightDown) && !uiOpen;
      updateHeldPlacement(uiOpen);
      if (mouseActive) {
        if (!game.player.swingAnimation.active || !game.player.swingAnimation.continuous) {
          game.player.startContinuousSwing(game.world.time);
        }
      } else if (game.player.swingAnimation.continuous) {
        game.player.stopSwing();
      }

      perf.startPhase('updateBreaker');
      if (game.input.mouse.leftDown && !uiOpen && multiplayer.canBuild()) {
        const tileX = Math.floor(game.camera.screenToWorldX(game.input.mouse.x) / TILE_SIZE);
        const tileY = Math.floor(game.camera.screenToWorldY(game.input.mouse.y) / TILE_SIZE);
        if (game.world.inBounds(tileX, tileY) && inReach(tileX, tileY)) {
          // One press does one kind of thing: started on a block, it only breaks blocks;
          // started on the background (a wall, or a background block you placed), it only
          // breaks the background. Background build mode is always the background.
          const id = game.world.getBlockId(tileX, tileY);
          const cell = game.world.getCell(tileX, tileY);
          const type = registry.get(id);
          const hasForeground = id !== 'air' && id !== 'water' && cell.meta?.layer !== 'bg';
          // A full solid block hides what's behind it, so that can't be mined through it.
          const coversBackground = hasForeground && type?.solid && (!type.shape || type.shape === 'full');
          const onBackground = game.backgroundBuild || game.wallPress;
          if (hasForeground && !onBackground) {
            game.breaker.begin(game.world, tileX, tileY, game.creativeMode, game.inventory.getSlot(game.selectedIndex), null);
          } else if (onBackground && !coversBackground) {
            const wallId = cell.meta?.bgId || (cell.meta?.layer === 'bg' ? id : game.renderer.naturalWallId(tileX, tileY));
            if (wallId) {
              game.breaker.begin(game.world, tileX, tileY, game.creativeMode, game.inventory.getSlot(game.selectedIndex), wallId);
            } else {
              game.breaker.cancel();
            }
          } else {
            game.breaker.cancel();
          }
        } else {
          game.breaker.cancel();
        }
      } else {
        game.breaker.cancel();
      }

      const broke = game.breaker.update(game.world, dt * game.gameSpeed);
      if (broke && broke.id) handleBrokenBlock(broke);
      perf.endPhase('updateBreaker');

      perf.startPhase('updateTicks');
      runGameTicks(dt);
      perf.endPhase('updateTicks');

      perf.startPhase('updateMultiplayer');
      multiplayer.update(dt);
      perf.endPhase('updateMultiplayer');

      if (game.openContainer) {
        const blockId = game.world.getBlockId(game.openContainer.tileX, game.openContainer.tileY);
        // Closed when the block it belongs to is gone.
        if (!isChest(blockId) && !registry.get(blockId)?.opens) closeInventory();
        // Keep an open furnace's progress bars moving smoothly.
        else if (game.openContainer.kind === 'furnace' && !multiplayer.isGuest)
          registry.get(blockId).tick(game.world, game.openContainer.tileX, game.openContainer.tileY, game.openContainer.meta);
      }

      perf.startPhase('updateChunks');
      preloadChunksAroundPlayer();
      perf.endPhase('updateChunks');

      perf.startPhase('updateCamera');
      const head = game.player.getHeadAnchor();
      game.camera.update(dt, game.canvas, game.world, game.camera.followGetter?.() || head);
      perf.endPhase('updateCamera');

      perf.startPhase('updateUI');
      updateHTMLUI();
      perf.endPhase('updateUI');
    } finally {
      perf.endPhase('updateTotal');
    }
  };

  const renderFunction = () => {
    game.renderer.render();
  };

  if (game.engine) game.engine.stop();
  game.engine = new Engine(updateFunction, renderFunction);
}
