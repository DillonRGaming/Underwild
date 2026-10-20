import './platform/webPlatform.js';
import { checkForAppUpdate } from './platform/appUpdate.js';
import { Input } from './core/input.js';
import { TILE_SIZE } from './core/utils.js';
import { setupTouchControls } from './ui/touchControls.js';
import { Camera } from './core/camera.js';
import { Renderer } from './core/renderer.js';
import { ModManager } from '../mods/index.js';
import { Placer } from './logic/placing.js';
import { Breaker } from './logic/breaking.js';
import { startIconPolish, refreshIcons } from './ui/iconPolish.js';
import { polishState, setPolish } from './core/polishSettings.js';
import { GAME_VERSION } from './game/version.js';
import { game, prefs, saveManager } from './game/state.js';
import {
  setBrowserFullscreen,
  applyAppSettings,
  applyViewSettings,
  loadBackgroundConfig,
  loadGameSettings,
  loadKeybinds,
  changeZoom,
  keybinds,
  defaultZoom,
  perfOverlay,
  setPerfOverlay,
  setRenderDistance,
  syncPolishOptions
} from './game/settings.js';
import { loadAudioSettings } from './ui/music.js';
import {
  SURVIVAL_REACH,
  CREATIVE_TOUCH_REACH,
  inReach,
  getMouseTileFromRaw,
  getScreenCoordsFromEvent,
  tryHitPlayer,
  useBucket,
  tryPlaceBlockAt
} from './game/interaction.js';
import { registry, isChest, isPlantBlock } from './game/content.js';
import { getRendererUI, startMenuLoop } from './game/loop.js';
import { multiplayer } from './game/net.js';
import { Inventory } from './logic/inventory.js';
import {
  lastMouseClient,
  gatherSameIntoHand,
  recomputeCraft,
  dropStackAtPlayer,
  closeInventory,
  getUIHitFromElement,
  shiftClickTransfer,
  craftAll,
  handleInventoryClick,
  shiftClickCreative,
  getSlotRef,
  openChest,
  openFurnace,
  openForge,
  throwSelectedBlock,
  throwFromInventory,
  isEditableTarget,
  bindCreativeSearch,
  bindCreativeSort
} from './ui/inventoryUI.js';
import { explosionContext } from './game/entities.js';
import { updateCommandSuggestions, openChat, closeChat, handleChatKey } from './game/commands.js';
import { holdMs } from './ui/craftingUI.js';
import { getSaveState } from './game/session.js';
import { MenuManager } from './ui/menus.js';

checkForAppUpdate(GAME_VERSION);

game.currentSeed = Math.floor(Math.random() * 1000000);

if (!window.electronAPI?.app) {
  const applySaved = () => {
    if (prefs.getBool('appFullscreen', false)) setBrowserFullscreen(true);
  };
  window.addEventListener('touchend', applySaved, { passive: true });
  window.addEventListener('click', applySaved);
}

// Scrolling the wheel over the log while you're not typing scrolls what is showing. It doesn't
// bring faded messages back; only opening the chat does that.
window.addEventListener(
  'wheel',
  (e) => {
    const log = document.getElementById('chatLog');
    const area = document.getElementById('chatArea');
    if (!log || !area || game.textInputMode || area.classList.contains('hidden')) return;
    const r = log.getBoundingClientRect();
    if (!r.width || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    log.scrollTop += e.deltaY;
  },
  { capture: true, passive: false }
);

(async () => {
  await prefs.init();
  applyAppSettings();
  window.electronAPI?.app?.ready?.({ ua: navigator.userAgent });
  loadBackgroundConfig();
  loadAudioSettings();
  loadKeybinds();
  loadGameSettings();
  applyViewSettings();
})();

game.tempKeybinds = { ...keybinds };

game.menuManager = new MenuManager();

game.canvas = document.getElementById('gameCanvas');

game.ctx = game.canvas.getContext('2d');

function resizeCanvas() {
  game.canvas.width = Math.floor(window.devicePixelRatio * game.canvas.clientWidth);
  game.canvas.height = Math.floor(window.devicePixelRatio * game.canvas.clientHeight);
}

function ensureCSSSize() {
  game.canvas.style.width = window.innerWidth + 'px';
  game.canvas.style.height = window.innerHeight + 'px';
}

ensureCSSSize();

resizeCanvas();

window.addEventListener('resize', () => {
  ensureCSSSize();
  resizeCanvas();
});

game.input = new Input(game.canvas);

game.input.mouse.x = game.canvas.width / 2;

game.input.mouse.y = game.canvas.height / 2;

setupTouchControls({
  canvas: game.canvas,
  input: game.input,
  keybinds,
  inGame: () => !!(game.world && game.player && !game.isLoading && !game.gamePaused && !game.inventoryOpen && !game.openContainer && !game.textInputMode),
  onInventory: () => window.dispatchEvent(new KeyboardEvent('keydown', { code: keybinds.inventory, key: 'e', bubbles: true })),
  onZoom: (direction) => changeZoom(direction),
  playerScreen: () =>
    game.player
      ? {
          x: game.camera.worldToScreenX(game.player.x + game.player.width / 2),
          y: game.camera.worldToScreenY(game.player.y + game.player.height * 0.4)
        }
      : null,
  // How far the aim stick reaches: as far as you can mine and place.
  reach: () => (game.creativeMode ? CREATIVE_TOUCH_REACH : SURVIVAL_REACH) * TILE_SIZE * game.camera.zoom,
  aimMode: () => prefs.get('touchAimMode') || 'tap',
  canReach: (tx, ty) => !!game.player && inReach(tx, ty),
  // The tile under a point on the canvas, and where that tile is (canvas pixels).
  tileAt: (sx, sy) => {
    const tx = Math.floor(game.camera.screenToWorldX(sx) / TILE_SIZE);
    const ty = Math.floor(game.camera.screenToWorldY(sy) / TILE_SIZE);
    return { tx, ty, x: game.camera.worldToScreenX(tx * TILE_SIZE), y: game.camera.worldToScreenY(ty * TILE_SIZE), size: TILE_SIZE * game.camera.zoom };
  }
});

game.camera = new Camera();

game.camera.zoom = Math.max(2.5, Math.min(6, prefs.getNumber('cameraZoom', defaultZoom())));

game.renderer = new Renderer(game.ctx, game.canvas, null, registry, game.camera, game.input, null, null, null, getRendererUI);

game.renderer.backgroundBlocks = game.backgroundBlocks;

game.renderer.multiplayer = multiplayer;

game.renderer.preloadTextures();

startMenuLoop();

game.modManager = new ModManager();

game.inventory = new Inventory(registry);

window.addEventListener('mousemove', (e) => {
  lastMouseClient.x = e.clientX;
  lastMouseClient.y = e.clientY;
});

game.placer = new Placer(registry);

game.breaker = new Breaker(registry);

game.inventoryCraftGrid = Array.from({ length: 4 }, () => null);

game.craftGrid = Array.from({ length: 9 }, () => null);

game.craftOutput = null;

game.craftMatch = null;

window.addEventListener('mousedown', (e) => {
  if (!game.world || !(game.inventoryOpen || game.openContainer)) return;
  // Put the held-item icon under the cursor right away, before any mousemove; otherwise
  // it first shows wherever it last was (the top-left corner on the first drag).
  const draggingDiv = document.getElementById('dragging-item');
  if (draggingDiv) {
    draggingDiv.style.left = e.clientX + 'px';
    draggingDiv.style.top = e.clientY + 'px';
  }
  if (e.target.closest?.('#chat, #chatSuggestions')) return;
  const hit = getUIHitFromElement(e.target);
  const inCreativeUI =
    e.target && !!e.target.closest?.('#creativePanel, .creative-panel, .creative-tabs, #creativeTabs, #creativeTabsBottom, .creative-grid, .creative-header');

  if (!hit) {
    if (game.creativeMode && game.draggingStack && inCreativeUI) {
      game.draggingStack = null;
      recomputeCraft();
      return;
    }
    // Clicking (or tapping) off the inventory with nothing in hand closes it.
    const outside = e.target.closest?.('.inventory-overlay') && !e.target.closest('.inventory-content, .inventory-frame, .creative-tabs');
    if (outside && !game.draggingStack && e.button === 0) {
      closeInventory();
      return;
    }
    if (game.draggingStack && e.target.closest?.('.inventory-overlay') && !e.target.closest('.inventory-content')) {
      if (game.creativeMode) {
        game.draggingStack = null;
      } else {
        const count = e.button === 2 ? 1 : game.draggingStack.count;
        dropStackAtPlayer(game.draggingStack, count);
        game.draggingStack.count -= count;
        if (game.draggingStack.count <= 0) game.draggingStack = null;
      }
      recomputeCraft();
    }
    return;
  }

  e.preventDefault();
  const slotKey = `${hit.area}:${hit.index ?? hit.tabId}`;
  game.dragStartSlot = slotKey;
  game.dragStartPos = { x: e.clientX, y: e.clientY };
  game.lastPaintSlot = slotKey;

  if (e.button === 0 && e.shiftKey) {
    if (hit.area === 'craftOut') craftAll();
    else if (hit.area === 'creative') shiftClickCreative(hit.index);
    else if (hit.area !== 'creativeTab') shiftClickTransfer(hit);
    return;
  }

  if (e.button === 0 && hit.area === 'inventory') {
    const now = Date.now();
    if (now - game.lastClickTime < 300 && game.lastClickSlot === hit.index && game.draggingStack && !game.inventory.getSlot(hit.index)) {
      gatherSameIntoHand();
      game.lastClickTime = 0;
      game.lastClickSlot = null;
      return;
    }
    game.lastClickTime = now;
    game.lastClickSlot = hit.index;
  }

  handleInventoryClick(hit, e.button === 2);
});

window.addEventListener('mousemove', (e) => {
  const draggingDiv = document.getElementById('dragging-item');
  if (draggingDiv && !draggingDiv.classList.contains('hidden')) {
    draggingDiv.style.left = e.clientX + 'px';
    draggingDiv.style.top = e.clientY + 'px';
  }

  if (!game.draggingStack || !(game.inventoryOpen || game.openContainer) || (e.buttons & 2) === 0) return;
  const hit = getUIHitFromElement(document.elementFromPoint(e.clientX, e.clientY));
  if (!hit || hit.area === 'craftOut' || hit.area === 'creative' || hit.area === 'creativeTab') return;
  const slotKey = `${hit.area}:${hit.index}`;
  if (slotKey === game.lastPaintSlot) return;
  game.lastPaintSlot = slotKey;
  const ref = getSlotRef(hit.area, hit.index);
  const slot = ref?.get();
  if (!ref || (ref.accepts && !ref.accepts(game.draggingStack))) return;
  if (!slot) {
    ref.set({ ...game.draggingStack, count: 1 });
    game.draggingStack.count -= 1;
  } else if (game.inventory.canMerge(slot, game.draggingStack) && slot.count < (slot.maxStack ?? 24)) {
    slot.count += 1;
    game.draggingStack.count -= 1;
  }
  if (game.draggingStack.count <= 0) game.draggingStack = null;
  recomputeCraft();
});

window.addEventListener('mouseup', (e) => {
  // Only a real drag drops the stack on release; a plain click just picks it up, even if
  // the slots shift under the cursor or the release lands a hair over the border.
  const dragged = game.dragStartPos && Math.hypot(e.clientX - game.dragStartPos.x, e.clientY - game.dragStartPos.y) > 8;
  if (game.draggingStack && (game.inventoryOpen || game.openContainer) && e.button === 0 && (dragged || game.dragStartSlot)) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const hit = getUIHitFromElement(el);
    const inCreativeUI =
      el && !!el.closest?.('#creativePanel, .creative-panel, .creative-tabs, #creativeTabs, #creativeTabsBottom, .creative-grid, .creative-header');
    if (game.creativeMode && (inCreativeUI || hit?.area === 'creative' || hit?.area === 'creativeTab')) {
      // Let go anywhere over the creative menu: the stack is thrown away.
      game.draggingStack = null;
    } else if (hit && `${hit.area}:${hit.index ?? hit.tabId}` !== game.dragStartSlot) {
      handleInventoryClick(hit, false);
    } else if (
      game.creativeMode &&
      dragged &&
      !hit &&
      !el?.closest?.('.inventory-slot, .hotbar-slot, .container-slot, .crafting-slot, .crafting-output-slot')
    ) {
      // Dragging and letting go outside slots in creative mode deletes the stack
      game.draggingStack = null;
    }
  }
  game.dragStartSlot = null;
  game.dragStartPos = null;
  game.lastPaintSlot = null;
});

// Stop the browser's own image dragging (the ghost picture you get on Windows).
window.addEventListener('dragstart', (e) => e.preventDefault());

window.addEventListener('contextmenu', (e) => {
  if (e.target.closest?.('.inventory-overlay, #hotbar')) e.preventDefault();
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) game.wallPress = false;
});

game.canvas.addEventListener('mousedown', (e) => {
  if (game.world && game.player && !game.gamePaused && !game.isLoading && !game.inventoryOpen && !game.openContainer && e.button === 0) {
    const { screenX, screenY } = getScreenCoordsFromEvent(e);
    const { tileX, tileY } = getMouseTileFromRaw(screenX, screenY);
    const targetId = game.world.getBlockId(tileX, tileY);
    // Started on a background thing (a wall, or a background block you placed): drag on.
    game.wallPress = targetId === 'air' || game.world.getCell(tileX, tileY).meta?.layer === 'bg';
    if (tryHitPlayer(screenX, screenY)) game.wallPress = false;
    if (targetId === 'air' || isPlantBlock(targetId)) game.player.playArmAction('attack');
  }
  if (!game.world || !game.player || game.gamePaused || game.isLoading || game.inventoryOpen || game.openContainer || e.button !== 2) return;
  const { screenX, screenY } = getScreenCoordsFromEvent(e);
  const { tileX, tileY } = getMouseTileFromRaw(screenX, screenY);

  const clickedId = game.world.getBlockId(tileX, tileY);
  if (clickedId === 'crafting_table') {
    game.openContainer = { title: 'Crafting Table', slots: game.craftGrid, capacity: 9, tileX, tileY };
    game.inventoryOpen = true;
    recomputeCraft();
    return;
  }
  if (isChest(clickedId)) {
    openChest(tileX, tileY);
    return;
  }
  if (clickedId === 'furnace') {
    openFurnace(tileX, tileY);
    return;
  }
  if (clickedId === 'forging_table') {
    openForge(tileX, tileY);
    return;
  }
  if (registry.get(clickedId)?.kind === 'trapdoor') {
    const meta = game.world.getCell(tileX, tileY).meta || {};
    // It always swings up on its hinge side, whichever side you open it from.
    game.world.setBlock(tileX, tileY, clickedId, { ...meta, open: !meta.open, hinge: meta.hinge || 'right' });
    return;
  }
  if (registry.get(clickedId)?.explosive) {
    registry.get(clickedId).prime(game.world, tileX, tileY, explosionContext());
    return;
  }
  if (useBucket(tileX, tileY)) return;

  game.lastPlaceTime = performance.now();
  game.placeHeld = true;
  tryPlaceBlockAt(screenX, screenY);
});

game.canvas.addEventListener(
  'wheel',
  (e) => {
    if (!game.world || game.inventoryOpen || game.openContainer) return;
    game.selectedIndex = e.deltaY > 0 ? (game.selectedIndex + 1) % 9 : (game.selectedIndex + 8) % 9;
    e.preventDefault();
  },
  { passive: false }
);

const chatInputElement = document.getElementById('chatInput');

if (chatInputElement) {
  chatInputElement.addEventListener('input', (e) => {
    if (!game.textInputMode) return;
    game.textInputValue = e.target.value;
    updateCommandSuggestions();
  });
}

window.addEventListener('keydown', (e) => {
  if (game.rebindingKey) return;
  if (game.textInputMode) {
    // Clicked off the text box: the chat key closes the chat instead of being lost.
    if (e.code === keybinds.chat && document.activeElement !== chatInputElement) {
      closeChat();
      e.preventDefault();
      return;
    }
    handleChatKey(e);
    return;
  }
  if (!game.world || !game.player || game.isLoading || isEditableTarget(e.target)) return;

  const uiOpen = game.inventoryOpen || !!game.openContainer;

  // - and + zoom the camera out and in.
  if (!uiOpen && !game.gamePaused && (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.code === 'Equal' || e.code === 'NumpadAdd')) {
    changeZoom(e.code === 'Minus' || e.code === 'NumpadSubtract' ? -1 : 1);
    e.preventDefault();
    return;
  }

  if (e.code === keybinds.pause) {
    if (uiOpen) closeInventory();
    else if (game.gamePaused) game.menuManager.resumeGame();
    else game.menuManager.showPauseMenu();
    e.preventDefault();
    return;
  }

  if (game.gamePaused) return;

  if (e.code === keybinds.inventory) {
    if (uiOpen) {
      closeInventory();
    } else {
      game.inventoryOpen = true;
      recomputeCraft();
    }
    return;
  }

  if (e.code.startsWith('Digit')) {
    const idx = parseInt(e.code.slice(5), 10) - 1;
    if (idx >= 0 && idx < 9) game.selectedIndex = idx;
    return;
  }

  if (uiOpen) {
    if (e.code === keybinds.drop && !e.repeat) throwFromInventory(e.ctrlKey);
    return;
  }

  if (e.code === keybinds.chat || e.code === 'Slash') {
    openChat(e.code === 'Slash' ? '/' : '');
    e.preventDefault();
    return;
  }
  if (e.code === keybinds.background) game.backgroundBuild = !game.backgroundBuild;

  if (e.code === 'BracketLeft') setRenderDistance(game.chunkRenderDistance - 1);
  if (e.code === 'BracketRight') setRenderDistance(game.chunkRenderDistance + 1);
  if (e.code === 'KeyP') game.showOutline = !game.showOutline;
  if (e.code === 'F3') {
    setPerfOverlay(!perfOverlay.visible);
    e.preventDefault();
  }
  if (e.code === keybinds.drop && !game.isDropKeyHeld) {
    // Throw straight away (a quick tap can be released before the next frame), then keep
    // throwing while it's held.
    game.isDropKeyHeld = true;
    throwSelectedBlock();
    game.lastDropTime = performance.now();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === keybinds.drop) game.isDropKeyHeld = false;
});

bindCreativeSearch();

bindCreativeSort();

window.addEventListener('mouseup', () => {
  game.recipeHold = null;
});

// The UI refreshes every few frames; the held row's sweep line runs every frame so it's smooth.
(function sweepCraftLine() {
  if (game.recipeHold) {
    const row = [...game.recipeHold.overlay.querySelectorAll('.recipe-row')].find((r) => r.dataset.key === game.recipeHold.key);
    const t = (performance.now() - game.recipeHold.start) / holdMs(game.recipeHold);
    row?.style.setProperty('--craft', Math.max(0, Math.min(1, t)).toFixed(4));
  }
  requestAnimationFrame(sweepCraftLine);
})();

window.addEventListener('beforeunload', () => {
  const state = getSaveState();
  if (state) saveManager.saveSync(state.world, state.player, state.items, state.inventory, state.meta);
  saveManager.stopAutoSave();
});

startIconPolish();

// The Toggle Polish key works everywhere: menus, inventory and in game (not while typing
// or while a key is being rebound).
window.addEventListener('keydown', (e) => {
  if (e.code !== keybinds.polish || e.repeat || isEditableTarget(e.target)) return;
  if (document.querySelector('.keybind-button.binding')) return;
  setPolish('enabled', !polishState().enabled);
  prefs.set('underwild_polish', JSON.stringify(polishState()));
  syncPolishOptions();
  refreshIcons();
});
