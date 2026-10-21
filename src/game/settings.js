// Options: graphics, zoom and GUI scale, keybinds, the app window and the menu background.
import { PerfOverlay } from '../ui/perfOverlay.js';
import { game, prefs } from './state.js';
import { showHudNote } from '../ui/chatLog.js';
import { syncCreativeSort } from '../ui/inventoryUI.js';

export const worldSuperflatLayers = [
  { blockId: 'grass', height: 1 },
  { blockId: 'dirt', height: 2 },
  { blockId: 'bedrock', height: 2 }
];

// Options > App: window controls on/off (the icon and fullscreen are applied by the app).
export function applyAppSettings() {
  document.body.classList.toggle('hide-window-controls', !prefs.getBool('appWindowControls', true));
}

// A block texture scaled up pixel-sharp to every common icon size and set as the
// window/taskbar icon. One big image gets shrunk by the system to odd sizes and blurs;
// with exact sizes it can pick one that's a whole multiple of the 16px texture.
const APP_ICON_SIZES = [16, 32, 48, 64, 128, 256];

// Outside the desktop app (a phone or the website) fullscreen is the browser's own.
// Browsers only allow it from a tap, so a saved "on" is applied at the first touch.
export function setBrowserFullscreen(on) {
  const el = document.documentElement;
  try {
    if (on && !document.fullscreenElement) el.requestFullscreen?.({ navigationUI: 'hide' })?.catch(() => {});
    else if (!on && document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {});
  } catch (e) {}
}

export function setAppIcon(img) {
  const data = APP_ICON_SIZES.map((size) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  });
  prefs.set('appIcon', img.dataset.id);
  prefs.set('appIconData', data);
  window.electronAPI?.app?.setIcon(data);
}

// --- Zoom and GUI scale -------------------------------------------------------------------
// Zoom: how close the camera is (- / + keys, or the phone's on-screen buttons).
// GUI scale: the size of the hotbar, inventory, menus and phone controls (Options > Graphics).
const ZOOM_MIN = 2.5;

const ZOOM_MAX = 6;

const ZOOM_STEP = 0.5;

// Phones start zoomed in to 150%, since their screens are small.
export function defaultZoom() {
  return document.body.classList.contains('touch-mode') || /[?&]touch\b/.test(location.search) || matchMedia?.('(pointer: coarse)').matches ? 4.5 : 3;
}

// Render scale (Options > Graphics): the share of the screen's resolution the game is drawn
// at, then stretched to fill it. Lower is blurrier but much lighter on a weak graphics chip;
// you see just as much of the world either way (the camera's zoom is scaled with it).
// The menu shows 25-100%, where its 100% is 70% of the screen's resolution: that looks the same
// as full resolution for pixel art like this, at about half the cost.
const FULL_RENDER_SCALE = 0.7;
export const RENDER_SCALES = [0.7, 0.525, 0.35, 0.175]; // shown as 100%, 75%, 50%, 25%
const DEFAULT_RENDER_SCALE = FULL_RENDER_SCALE;

export function renderScale() {
  const s = prefs.getNumber('renderScale', DEFAULT_RENDER_SCALE);
  return RENDER_SCALES.includes(s) ? s : DEFAULT_RENDER_SCALE;
}

// The render scale actually used: nudged so a texture pixel is a whole number of canvas
// pixels at the current zoom. Otherwise texels come out uneven and outlines (always whole
// pixels) look thicker or thinner than the texture's pixels as you zoom.
export function effectiveRenderScale() {
  // The camera's actual zoom (cutscenes zoom too), or the chosen one before there's a camera.
  const z = game.camera?.renderZoom || viewZoom();
  return Math.max(1, Math.round(z * renderScale())) / z;
}

export function setRenderScale(scale) {
  prefs.set('renderScale', scale);
  window.dispatchEvent(new Event('resize')); // resizes the canvas (script.js)
  applyViewSettings();
}

// The zoom you chose, before the render scale.
function viewZoom() {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prefs.getNumber('cameraZoom', defaultZoom())));
}

export function applyViewSettings() {
  if (game.camera) game.camera.userZoom = viewZoom();
  document.documentElement.style.setProperty('--gui-scale', String(prefs.getNumber('guiScale', 1)));
}

export function changeZoom(direction) {
  if (!game.camera) return;
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, viewZoom() + direction * ZOOM_STEP));
  prefs.set('cameraZoom', zoom);
  game.camera.userZoom = zoom; // the camera eases there (and fits the canvas resolution once it arrives)
  game.lastPreloadChunk = null; // load more chunks if the wider view needs them
  showHudNote(`Zoom: ${Math.round((zoom / 3) * 100)}%`);
}

export function setGuiScale(scale) {
  prefs.set('guiScale', scale);
  applyViewSettings();
}

export function saveBackgroundConfig() {
  prefs.set('underwild_background_blocks', JSON.stringify(game.backgroundBlocks));
  if (game.renderer) {
    game.renderer.backgroundBlocks = game.backgroundBlocks;
    game.renderer._menuBgKey = null;
  }
}

export function loadBackgroundConfig() {
  const saved = prefs.get('underwild_background_blocks');
  if (saved) {
    try {
      game.backgroundBlocks = JSON.parse(saved);
    } catch (e) {
      game.backgroundBlocks = ['sand', 'smooth_sandstone'];
    }
  }

  if (game.backgroundBlocks.length === 0) {
    game.backgroundBlocks = ['dirt'];
  }

  if (game.renderer) game.renderer.backgroundBlocks = game.backgroundBlocks;
  game.menuManager?.updateBackgroundUI();
}

export const DEFAULT_KEYBINDS = Object.freeze({
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouch: 'ControlLeft',
  inventory: 'KeyE',
  chat: 'KeyT',
  drop: 'KeyQ',
  pause: 'Escape',
  background: 'KeyZ',
  rotate: 'KeyR',
  flip: 'KeyF',
  outline: 'KeyP',
  zoomOut: 'Minus',
  zoomIn: 'Equal',
  renderLess: 'BracketLeft',
  renderMore: 'BracketRight',
  perf: 'F3'
});

export const keybinds = { ...DEFAULT_KEYBINDS };

const SETTING_GROUPS = {
  renderDistance: ['render-tiny', 'render-short', 'render-normal', 'render-far', 'render-extreme'],
  fallingLeaves: ['leaves-on', 'leaves-off'],
  autoJump: ['auto-jump-on', 'auto-jump-off'],
  perfOverlay: ['perf-overlay-on', 'perf-overlay-off']
};

export const perfOverlay = new PerfOverlay();

export function setPerfOverlay(on) {
  perfOverlay.setVisible(on);
  selectSettingButton('perfOverlay', on ? 'perf-overlay-on' : 'perf-overlay-off');
  prefs.set('perfOverlay', !!on);
}

function selectSettingButton(group, action) {
  for (const id of SETTING_GROUPS[group]) {
    const button = document.querySelector(`[data-action="${id}"]`);
    if (!button) continue;
    if (id === action) button.setAttribute('data-selected', 'true');
    else button.removeAttribute('data-selected');
  }
}

export function saveGameSettings() {
  prefs.set(
    'underwild_gameSettings',
    JSON.stringify({
      renderDistance: game.renderDistance,
      renderChunks: game.chunkRenderDistance,
      renderFallingLeaves: game.renderFallingLeaves,
      autoJump: game.autoJump
    })
  );
}

export function loadGameSettings() {
  prefs.delete('underwild_polish'); // the old polish toggles, now always on
  game.creativeSortMode = prefs.get('creativeSort') === 'type' ? 'type' : 'material';
  game.creativeCategoriesCache = null;
  game.renderedCreativeTab = null;
  syncCreativeSort();
  try {
    const saved = JSON.parse(prefs.get('underwild_gameSettings') || '{}');
    if (RENDER_DISTANCE_CHUNKS[saved.renderDistance]) game.renderDistance = saved.renderDistance;
    if (typeof saved.renderFallingLeaves === 'boolean') game.renderFallingLeaves = saved.renderFallingLeaves;
    if (typeof saved.autoJump === 'boolean') game.autoJump = saved.autoJump;
  } catch (e) {}
  let savedChunks = null;
  try {
    savedChunks = JSON.parse(prefs.get('underwild_gameSettings') || '{}').renderChunks;
  } catch (e) {}
  // The exact distance set with the keys, if there is one; otherwise the menu's choice.
  setRenderDistance(Number.isFinite(savedChunks) ? savedChunks : RENDER_DISTANCE_CHUNKS[game.renderDistance]);
  selectSettingButton('renderDistance', `render-${game.renderDistance}`);
  selectSettingButton('fallingLeaves', game.renderFallingLeaves ? 'leaves-on' : 'leaves-off');
  selectSettingButton('autoJump', game.autoJump ? 'auto-jump-on' : 'auto-jump-off');
  perfOverlay.setVisible(prefs.getBool('perfOverlay', false));
  selectSettingButton('perfOverlay', perfOverlay.visible ? 'perf-overlay-on' : 'perf-overlay-off');
  const sfx = prefs.get('underwild_sfxVolume');
  if (sfx !== null) {
    game.sfxVolume = parseInt(sfx, 10);
    const slider = document.getElementById('sfxVolume');
    const label = document.getElementById('sfxVolumeValue');
    if (slider) slider.value = game.sfxVolume;
    if (label) label.textContent = game.sfxVolume;
  }
}

export function loadKeybinds() {
  const saved = prefs.get('underwild_keybinds');
  if (saved) {
    try {
      // Only keys the game still has (old saves may carry removed ones, like Toggle Polish).
      for (const [action, code] of Object.entries(JSON.parse(saved))) if (action in DEFAULT_KEYBINDS) keybinds[action] = code;
    } catch (e) {}
  }
}

export function saveKeybinds() {
  prefs.set('underwild_keybinds', JSON.stringify(keybinds));
}

export function syncSliderFill(slider) {
  const min = Number(slider.min) || 0;
  const max = Number(slider.max) || 100;
  slider.style.setProperty('--fill', `${((Number(slider.value) - min) / (max - min || 1)) * 100}%`);
}

export const RENDER_DISTANCE_CHUNKS = { tiny: 2, short: 4, normal: 6, far: 8, extreme: 12 };

// The render distance keys: one chunk further or nearer, shown and saved.
export function stepRenderDistance(step) {
  setRenderDistance(game.chunkRenderDistance + step);
  const preset = Object.keys(RENDER_DISTANCE_CHUNKS).find((k) => RENDER_DISTANCE_CHUNKS[k] === game.chunkRenderDistance);
  if (preset) {
    game.renderDistance = preset;
    selectSettingButton('renderDistance', `render-${preset}`);
  } else selectSettingButton('renderDistance', null);
  saveGameSettings();
  showHudNote(`Render distance: ${game.chunkRenderDistance} chunks`);
}

export function setRenderDistance(distance) {
  game.chunkRenderDistance = Math.max(1, Math.min(32, distance));
  // The next preload works out how many chunks to keep (it counts the zoom too).
  if (game.world) game.lastPreloadChunk = null;
}
