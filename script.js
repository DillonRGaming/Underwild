import { Engine } from './src/core/engine.js';
import { Input } from './src/core/input.js';
import { Renderer } from './src/core/renderer.js';
import { World } from './src/core/world.js';
import { Camera } from './src/core/camera.js';
import { BlockRegistry } from './src/core/registry.js';
import { Player } from './src/entities/player.js';
import { TILE_SIZE, rectsOverlap } from './src/core/utils.js';
import { registerAllBlocks } from './blocks/index.js';
import { isChest } from './blocks/chest.js';
import { ensureFurnaceMeta, SMELTING, fuelTime } from './blocks/furnace.js';
import { HEAD_TYPES, heatedIngotMaterial } from './blocks/forging_table.js';
import { migrateLegacyId } from './src/core/legacyIds.js';
import { registerAllItems } from './items/index.js';
import { sampleBlockAt, nearestFallenTreeX, nearestLakeX } from './src/logic/terrainGen.js';
import { findBiomeId, nearestBiomeEdge, leafFallAt, BIOME_ZONE } from './src/logic/biomes.js';
import { Placer } from './src/logic/placing.js';
import { Breaker } from './src/logic/breaking.js';
import { findMatchingRecipe, consumeRecipeIngredients, createRecipeOutput } from './src/logic/crafting.js';
import { LeafParticle } from './src/entities/leaf_particle.js';
import { ExplosionFX } from './src/entities/explosion_fx.js';
import { PrimedExplosive } from './src/entities/primed_explosive.js';
import { ModManager } from './mods/index.js';
import { SaveManager } from './src/core/saveManager.js';
import { Preferences } from './src/core/preferences.js';

import { ItemEntity } from './src/entities/item.js';

const GAME_VERSION = '0.5.0';

let worldName = 'New World';
let worldSeed = '';
let worldGameMode = 'survival';
let worldCheatsEnabled = false;
let worldAllowCommands = false;
let worldGenerateStructures = true;
let worldDifficulty = 'easy';
let worldType = 'regular';
let worldSize = 'normal';
let worldStartingTime = 'day';

let worldSuperflatLayers = [
  { blockId: 'grass', height: 1 },
  { blockId: 'dirt', height: 2 },
  { blockId: 'bedrock', height: 2 }
];

let startingHealth = 10;
let startingHunger = 10;

let renderDistance = 'normal';
let textureQuality = 'fancy';
let autoJump = true;
let renderFallingLeaves = true;
let masterVolume = 100;
let musicVolume = 50;
let sfxVolume = 75;
let mouseSensitivity = 50;

let backgroundMusic = null;
let isMusicPlaying = false;
let musicFadeInterval = null;
let musicLoopTimeout = null;
const MUSIC_SWITCH_FADE_MS = 1500;

const musicTracks = {
  'underwild-mystic': { id: 'underwild-mystic', name: 'Underwild - Mystic', file: 'ui/underwild-mystic.mp3' },
  'underwild-skynight': { id: 'underwild-skynight', name: 'Underwild - Sky and Night', file: 'ui/underwild-skynight.mp3' },
  "underwild-sodium": { id: "underwild-sodium", name: "Underwild - Sodium", file: "ui/underwild-sodium.mp3" },
  "underwild-thoughts": { id: "underwild-thoughts", name: "Underwild - Thoughts", file: "ui/underwild-thoughts.mp3" },
  "underwild-fairy": { id: "underwild-fairy", name: "Underwild - Fairy", file: "ui/underwild-fairy.mp3" },
  "underwild-adventure": { id: "underwild-adventure", name: "Underwild - Adventure", file: "ui/underwild-adventure.mp3" },
};

let currentTrackId = 'underwild-mystic';

let backgroundBlocks = ['dirt', 'coarse_dirt'];

let world = null;
let currentSeed = Math.floor(Math.random() * 1000000);
let items = [];
let leafParticles = [];
const explosionFX = new ExplosionFX();
const primedExplosives = [];
const PLACE_REPEAT_MS = 200;
let lastPlaceTime = 0;
let placeHeld = false;
// /tp fallen and /tp <biome> targets already visited this session, so repeats go somewhere new.
const tpVisited = new Map();
let gameSpeed = 1;
let setPosition1 = null;
let setPosition2 = null;
let isLoading = false;
let creativeMode = false;
const saveManager = new SaveManager();
const prefs = new Preferences();
let currentWorldSaveName = null;

(async () => {
  await prefs.init();
  loadBackgroundConfig();
  loadAudioSettings();
  loadKeybinds();
  loadGameSettings();
})();

const registry = new BlockRegistry();
registerAllBlocks(registry);
registerAllItems(registry);
window.registry = registry;

let player = null;

let inventory = null;

let camera = null;

let input = null;

let canvas = null;

let ctx = null;

let modManager = null;

let engine = null;
let renderer = null;

let breaker = null;

let placer = null;

let inventoryCraftGrid = null;

let craftGrid = null;

let craftOutput = null;

let craftMatch = null;

let openContainer = null;

let draggingStack = null;

let isDropKeyHeld = false;
let lastDropTime = 0;
let dropInterval = 150;

function saveBackgroundConfig() {
  prefs.set('underwild_background_blocks', JSON.stringify(backgroundBlocks));
  window.backgroundBlocks = backgroundBlocks;

  if (window.renderer && window.renderer.mainMenuPatterns) {
    window.renderer.mainMenuPatterns = null;
  }
}

function loadBackgroundConfig() {
  const saved = prefs.get('underwild_background_blocks');
  if (saved) {
    try {
      backgroundBlocks = JSON.parse(saved);
    } catch (e) {
      backgroundBlocks = ['dirt', 'coarse_dirt'];
    }
  }

  if (backgroundBlocks.length === 0) {
    backgroundBlocks = ['dirt'];
  }

  window.backgroundBlocks = backgroundBlocks;

  if (window.menuManager && window.menuManager.updateBackgroundUI) {
    window.menuManager.updateBackgroundUI();
  }
}

function setupBackgroundMusic() {
  if (!backgroundMusic) {
    const track = musicTracks[currentTrackId];
    backgroundMusic = new Audio(track.file);
    backgroundMusic.loop = false;
    backgroundMusic.volume = 0;
    
    backgroundMusic.addEventListener('ended', handleMusicEnd);
  }
}

function updateMusicVolume() {
  if (musicFadeInterval) {
    clearInterval(musicFadeInterval);
    musicFadeInterval = null;
  }
  if (backgroundMusic) {
    const actualVolume = (masterVolume / 100) * (musicVolume / 100);
    backgroundMusic.volume = actualVolume;
  }
}

function fadeMusic(toVolume, duration = 10000) {
  return new Promise((resolve) => {
    if (!backgroundMusic) {
      resolve();
      return;
    }
    
    const startVolume = backgroundMusic.volume;
    const startTime = Date.now();
    const endTime = startTime + duration;
    
    if (musicFadeInterval) {
      clearInterval(musicFadeInterval);
    }
    
    if (Math.abs(backgroundMusic.volume - toVolume) < 0.01) {
      resolve();
      return;
    }
    
    musicFadeInterval = setInterval(() => {
      const now = Date.now();
      if (now >= endTime) {
        backgroundMusic.volume = toVolume;
        clearInterval(musicFadeInterval);
        musicFadeInterval = null;
        resolve();
        return;
      }
      
      const elapsed = now - startTime;
      const progress = elapsed / duration;
      const currentVolume = startVolume + (toVolume - startVolume) * progress;
      backgroundMusic.volume = Math.max(0, Math.min(1, currentVolume));
    }, 50);
  });
}

function switchMusicTrack(trackId) {
  if (!musicTracks[trackId]) return;
  
  if (musicFadeInterval) {
    clearInterval(musicFadeInterval);
    musicFadeInterval = null;
  }
  if (musicLoopTimeout) {
    clearTimeout(musicLoopTimeout);
    musicLoopTimeout = null;
  }
  if (backgroundMusic) {
    backgroundMusic.removeEventListener('ended', handleMusicEnd);
    backgroundMusic.pause();
    backgroundMusic = null;
  }
  isMusicPlaying = false;
  currentTrackId = trackId;
  prefs.set('underwild_musicTrack', trackId);
  setupBackgroundMusic();
  startBackgroundMusic(MUSIC_SWITCH_FADE_MS);
}

function updateMusicTrackSelection() {
  const allTrackItems = document.querySelectorAll('.music-track-item');
  allTrackItems.forEach(item => {
    item.classList.remove('selected');
  });
  
  const currentTrackItem = document.querySelector(`.music-track-item[data-track="${currentTrackId}"]`);
  if (currentTrackItem) {
    currentTrackItem.classList.add('selected');
  }
  
  const musicTrackSelector = document.getElementById('musicTrack');
  if (musicTrackSelector) {
    musicTrackSelector.value = currentTrackId;
  }
}

function handleMusicEnd() {
  if (!backgroundMusic) return;
  if (musicLoopTimeout) clearTimeout(musicLoopTimeout);
  backgroundMusic.volume = 0;
  musicLoopTimeout = setTimeout(() => {
    musicLoopTimeout = null;
    if (!isMusicPlaying || !backgroundMusic) return;
    backgroundMusic.currentTime = 0;
    backgroundMusic.play()
      .then(() => fadeMusic((masterVolume / 100) * (musicVolume / 100), 10000))
      .catch(() => { });
  }, 2000);
}

function startBackgroundMusic(fadeMs = 10000) {
  if (!backgroundMusic) setupBackgroundMusic();
  if (isMusicPlaying) return;
  const track = backgroundMusic;
  isMusicPlaying = true;
  track.volume = 0;
  track.play()
    .then(() => {
      if (track !== backgroundMusic) return;
      fadeMusic((masterVolume / 100) * (musicVolume / 100), fadeMs);
    })
    .catch(() => {
      if (track === backgroundMusic) isMusicPlaying = false;
    });
}

function loadAudioSettings() {
  const savedMasterVolume = prefs.get('underwild_masterVolume');
  const savedMusicVolume = prefs.get('underwild_musicVolume');
  const savedMusicTrack = prefs.get('underwild_musicTrack');
  
  if (savedMasterVolume !== null) {
    masterVolume = parseInt(savedMasterVolume, 10);
    const masterSlider = document.getElementById('masterVolume');
    const masterValue = document.getElementById('masterVolumeValue');
    if (masterSlider) masterSlider.value = masterVolume;
    if (masterValue) masterValue.textContent = masterVolume;
  }
  
  if (savedMusicVolume !== null) {
    musicVolume = parseInt(savedMusicVolume, 10);
    const musicSlider = document.getElementById('musicVolume');
    const musicValue = document.getElementById('musicVolumeValue');
    if (musicSlider) musicSlider.value = musicVolume;
    if (musicValue) musicValue.textContent = musicVolume;
  }
  
  if (savedMusicTrack !== null && musicTracks[savedMusicTrack]) {
    currentTrackId = savedMusicTrack;
  } else if (!musicTracks[currentTrackId]) {
    const firstTrackId = Object.keys(musicTracks)[0];
    if (firstTrackId) {
      currentTrackId = firstTrackId;
    }
  }
  
  if (backgroundMusic) {
    updateMusicVolume();
  }
}

const DEFAULT_KEYBINDS = Object.freeze({
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
  flip: 'KeyF'
});

const keybinds = { ...DEFAULT_KEYBINDS };

const THEMES = {
  minimal: { name: 'Minimal', stylesheet: 'themes/minimal/theme.css' },
  java: { name: 'Java Edition', stylesheet: 'themes/java/theme.css' },
  modern: { name: 'Modern', stylesheet: 'themes/modern/theme.css' },
  bedrock: { name: 'Bedrock Edition', stylesheet: 'themes/bedrock/theme.css' }
};
const DEFAULT_THEME = 'minimal';
let currentTheme = DEFAULT_THEME;

function applyTheme(themeId) {
  const theme = THEMES[themeId] || THEMES[DEFAULT_THEME];
  currentTheme = THEMES[themeId] ? themeId : DEFAULT_THEME;
  const link = document.getElementById('themeStylesheet');
  if (link && !link.href.endsWith(theme.stylesheet)) link.href = theme.stylesheet;
  document.documentElement.dataset.theme = currentTheme;
  selectSettingButton('theme', `theme-${currentTheme}`);
}

const SETTING_GROUPS = {
  theme: Object.keys(THEMES).map(id => `theme-${id}`),
  renderDistance: ['render-tiny', 'render-short', 'render-normal', 'render-far', 'render-extreme'],
  textureQuality: ['texture-fast', 'texture-fancy'],
  fallingLeaves: ['leaves-on', 'leaves-off'],
  autoJump: ['auto-jump-on', 'auto-jump-off']
};

function selectSettingButton(group, action) {
  for (const id of SETTING_GROUPS[group]) {
    const button = document.querySelector(`[data-action="${id}"]`);
    if (!button) continue;
    if (id === action) button.setAttribute('data-selected', 'true');
    else button.removeAttribute('data-selected');
  }
}

function saveGameSettings() {
  prefs.set('underwild_gameSettings', JSON.stringify({ renderDistance, textureQuality, renderFallingLeaves, autoJump, theme: currentTheme }));
}

function loadGameSettings() {
  try {
    const saved = JSON.parse(prefs.get('underwild_gameSettings') || '{}');
    if (RENDER_DISTANCE_CHUNKS[saved.renderDistance]) renderDistance = saved.renderDistance;
    if (saved.textureQuality === 'fast' || saved.textureQuality === 'fancy') textureQuality = saved.textureQuality;
    if (typeof saved.renderFallingLeaves === 'boolean') renderFallingLeaves = saved.renderFallingLeaves;
    if (typeof saved.autoJump === 'boolean') autoJump = saved.autoJump;
    if (THEMES[saved.theme]) currentTheme = saved.theme;
  } catch (e) {
  }
  applyTheme(currentTheme);
  setRenderDistance(RENDER_DISTANCE_CHUNKS[renderDistance]);
  selectSettingButton('renderDistance', `render-${renderDistance}`);
  selectSettingButton('textureQuality', `texture-${textureQuality}`);
  selectSettingButton('fallingLeaves', renderFallingLeaves ? 'leaves-on' : 'leaves-off');
  selectSettingButton('autoJump', autoJump ? 'auto-jump-on' : 'auto-jump-off');
  const sfx = prefs.get('underwild_sfxVolume');
  if (sfx !== null) {
    sfxVolume = parseInt(sfx, 10);
    const slider = document.getElementById('sfxVolume');
    const label = document.getElementById('sfxVolumeValue');
    if (slider) slider.value = sfxVolume;
    if (label) label.textContent = sfxVolume;
  }
}

function loadKeybinds() {
  const saved = prefs.get('underwild_keybinds');
  if (saved) {
    try {
      Object.assign(keybinds, JSON.parse(saved));
    } catch (e) {
    }
  }
}

function saveKeybinds() {
  prefs.set('underwild_keybinds', JSON.stringify(keybinds));
}

let tempKeybinds = { ...keybinds };

let rebindingKey = null;

function syncSliderFill(slider) {
  const min = Number(slider.min) || 0;
  const max = Number(slider.max) || 100;
  slider.style.setProperty('--fill', `${((Number(slider.value) - min) / (max - min || 1)) * 100}%`);
}

class MenuManager {
  constructor() {
    this.currentMenu = 'mainMenu';
    this.initializeMenus();
    this.bindEvents();
  }

  initializeMenus() {
    document.querySelectorAll('.menu-container').forEach(menu => {
      menu.classList.add('hidden');
    });
    document.getElementById('mainMenu').classList.remove('hidden');

    const healthDisplay = document.getElementById('healthDisplay');
    const hungerDisplay = document.getElementById('hungerDisplay');
    if (healthDisplay) healthDisplay.classList.add('hidden');
    if (hungerDisplay) hungerDisplay.classList.add('hidden');

    this.updateVersionNumber();
  }

  showMenu(menuId) {
    document.querySelectorAll('.menu-container').forEach(menu => menu.classList.add('hidden'));
    const menu = menuId && document.getElementById(menuId);
    if (menu) menu.classList.remove('hidden');
    document.body.classList.toggle('game-paused', !!(world && gamePaused));
    this.currentMenu = menuId;
    if (menu) menu.querySelectorAll('.minecraft-slider').forEach(syncSliderFill);
  }

  updateVersionNumber() {
    const versionElement = document.querySelector('.version-number');
    if (versionElement) {
      versionElement.textContent = `v${GAME_VERSION}`;
    }
  }

  bindEvents() {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('minecraft-button') || e.target.classList.contains('keybind-button')) {
        const action = e.target.dataset.action;
        this.handleButtonClick(action, e.target);
      }
    });

    this.bindFormInputs();

    this.bindSliders();
  }

  handleButtonClick(action, button) {
    switch (action) {
       case 'single-player':
         this.showMenu('createWorldMenu');
         break;
      case 'load-world':
        this.showWorldList();
        break;

      case 'mods':
        this.showMenu('modsMenu');
        this.populateModsMenu();
        break;
      case 'options':
        this.showMenu('optionsMenu');
        break;
      case 'skins-options':
        this.showMenu('skinMenu');
        this.initializeSkinMenu();
        break;
      case 'quit':
        if (window.electronAPI?.window) window.electronAPI.window.close();
        else window.close();
        break;
      case 'changelog':
        this.showMenu('changelogMenu');
        break;
      case 'info-tab':
        document.querySelectorAll('.info-tab').forEach(t => t.removeAttribute('data-selected'));
        button.setAttribute('data-selected', 'true');
        document.querySelectorAll('.info-panel').forEach(p => p.classList.add('hidden'));
        document.querySelector(`.info-panel[data-panel="${button.dataset.tab}"]`)?.classList.remove('hidden');
        break;
       case 'create-world':
         this.createWorld();
         break;

      case 'back-to-main':
        this.showMenu(world && gamePaused ? 'pauseMenu' : 'mainMenu');
        break;
      case 'graphics-options':
        this.showMenu('graphicsOptionsMenu');
        break;
      case 'background-options':
        this.showMenu('backgroundOptionsMenu');
        this.initializeBackgroundUI();
        break;
      case 'gameplay-options':
        this.showMenu('gameplayOptionsMenu');
        break;
      case 'audio-options':
        this.showMenu('audioOptionsMenu');
        setTimeout(() => {
          updateMusicTrackSelection();
        }, 100);
        break;
      case 'controls-options':
        this.showMenu('controlsOptionsMenu');
        this.initializeKeybindButtons();
        break;
      case 'back-to-options':
        this.showMenu('optionsMenu');
        break;
      case 'back-to-main-from-skin':
        this.showMenu(world && gamePaused ? 'pauseMenu' : 'mainMenu');
        break;
      case 'show-advanced-options':
        this.showMenu('advancedOptionsMenu');
        break;
      case 'back-to-create-world':
        this.showMenu('createWorldMenu');
        break;

      case 'game-mode-survival':
        this.updateButtonGroup(button, 'game-mode-survival', 'game-mode-creative');
        worldGameMode = 'survival';
        break;
      case 'game-mode-creative':
        this.updateButtonGroup(button, 'game-mode-survival', 'game-mode-creative');
        worldGameMode = 'creative';
        break;

      case 'world-type-regular':
        this.updateButtonGroup(button, 'world-type-regular', 'world-type-superflat', 'world-type-mountains');
        worldType = 'regular';
        break;
      case 'world-type-superflat':
        this.updateButtonGroup(button, 'world-type-regular', 'world-type-superflat', 'world-type-mountains');
        worldType = 'superflat';
        break;
      case 'world-type-mountains':
        this.updateButtonGroup(button, 'world-type-regular', 'world-type-superflat', 'world-type-mountains');
        worldType = 'mountains';
        break;

      case 'render-tiny':
      case 'render-short':
      case 'render-normal':
      case 'render-far':
      case 'render-extreme':
        this.updateButtonGroup(button, 'render-tiny', 'render-short', 'render-normal', 'render-far', 'render-extreme');
        renderDistance = action.slice('render-'.length);
        setRenderDistance(RENDER_DISTANCE_CHUNKS[renderDistance]);
        saveGameSettings();
        break;

      case 'theme-minimal':
      case 'theme-java':
      case 'theme-modern':
      case 'theme-bedrock':
        applyTheme(action.slice('theme-'.length));
        saveGameSettings();
        break;

      case 'texture-fast':
        this.updateButtonGroup(button, 'texture-fast', 'texture-fancy');
        textureQuality = 'fast';
        saveGameSettings();
        break;
      case 'texture-fancy':
        this.updateButtonGroup(button, 'texture-fast', 'texture-fancy');
        textureQuality = 'fancy';
        saveGameSettings();
        break;

      case 'auto-jump-on':
        this.updateButtonGroup(button, 'auto-jump-on', 'auto-jump-off');
        autoJump = true;
        saveGameSettings();
        break;
      case 'auto-jump-off':
        this.updateButtonGroup(button, 'auto-jump-on', 'auto-jump-off');
        autoJump = false;
        saveGameSettings();
        break;

      case 'leaves-on':
        this.updateButtonGroup(button, 'leaves-on', 'leaves-off');
        renderFallingLeaves = true;
        saveGameSettings();
        break;
      case 'leaves-off':
        this.updateButtonGroup(button, 'leaves-on', 'leaves-off');
        renderFallingLeaves = false;
        leafParticles.length = 0;
        saveGameSettings();
        break;

      case 'bind-forward':
      case 'bind-backward':
      case 'bind-left':
      case 'bind-right':
      case 'bind-jump':
      case 'bind-sprint':
      case 'bind-crouch':
      case 'bind-inventory':
      case 'bind-chat':
      case 'bind-drop':
      case 'bind-pause':
      case 'bind-background':
      case 'bind-rotate':
      case 'bind-flip':
        this.startKeybindRebinding(action.replace('bind-', ''));
        break;

      case 'apply-controls':
        this.applyKeybindChanges();
        break;
      case 'reset-controls':
        this.resetKeybindsToDefault();
        break;

      case 'enable-mod':
        this.enableMod();
        break;
      case 'disable-mod':
        this.disableMod();
        break;
      case 'apply-background':
        this.applyBackgroundChanges();
        break;

      case 'world-size-tiny':
        this.updateButtonGroup(button, 'world-size-tiny', 'world-size-small', 'world-size-normal', 'world-size-large');
        worldSize = 'tiny';
        break;
      case 'world-size-small':
        this.updateButtonGroup(button, 'world-size-tiny', 'world-size-small', 'world-size-normal', 'world-size-large');
        worldSize = 'small';
        break;
      case 'world-size-normal':
        this.updateButtonGroup(button, 'world-size-tiny', 'world-size-small', 'world-size-normal', 'world-size-large');
        worldSize = 'normal';
        break;
      case 'world-size-large':
        this.updateButtonGroup(button, 'world-size-tiny', 'world-size-small', 'world-size-normal', 'world-size-large');
        worldSize = 'large';
        break;

      case 'time-day':
        this.updateButtonGroup(button, 'time-day', 'time-night', 'time-sunset', 'time-dawn');
        worldStartingTime = 'day';
        break;
      case 'time-night':
        this.updateButtonGroup(button, 'time-day', 'time-night', 'time-sunset', 'time-dawn');
        worldStartingTime = 'night';
        break;
      case 'time-sunset':
        this.updateButtonGroup(button, 'time-day', 'time-night', 'time-sunset', 'time-dawn');
        worldStartingTime = 'sunset';
        break;
      case 'time-dawn':
        this.updateButtonGroup(button, 'time-day', 'time-night', 'time-sunset', 'time-dawn');
        worldStartingTime = 'dawn';
        break;

      case 'difficulty-peaceful':
        this.updateButtonGroup(button, 'difficulty-peaceful', 'difficulty-easy', 'difficulty-normal', 'difficulty-hard');
        worldDifficulty = 'peaceful';
        break;
      case 'difficulty-easy':
        this.updateButtonGroup(button, 'difficulty-peaceful', 'difficulty-easy', 'difficulty-normal', 'difficulty-hard');
        worldDifficulty = 'easy';
        break;
      case 'difficulty-normal':
        this.updateButtonGroup(button, 'difficulty-peaceful', 'difficulty-easy', 'difficulty-normal', 'difficulty-hard');
        worldDifficulty = 'normal';
        break;
      case 'difficulty-hard':
        this.updateButtonGroup(button, 'difficulty-peaceful', 'difficulty-easy', 'difficulty-normal', 'difficulty-hard');
        worldDifficulty = 'hard';
        break;

      case 'structures-on':
        this.updateButtonGroup(button, 'structures-on', 'structures-off');
        worldGenerateStructures = true;
        break;
      case 'structures-off':
        this.updateButtonGroup(button, 'structures-on', 'structures-off');
        worldGenerateStructures = false;
        break;

      case 'cheats-on':
        this.updateButtonGroup(button, 'cheats-on', 'cheats-off');
        worldCheatsEnabled = true;
        break;
      case 'cheats-off':
        this.updateButtonGroup(button, 'cheats-on', 'cheats-off');
        worldCheatsEnabled = false;
        break;

      case 'commands-on':
        this.updateButtonGroup(button, 'commands-on', 'commands-off');
        worldAllowCommands = true;
        break;
      case 'commands-off':
        this.updateButtonGroup(button, 'commands-on', 'commands-off');
        worldAllowCommands = false;
        break;

      case 'start-health-1':
      case 'start-health-2':
      case 'start-health-3':
      case 'start-health-4':
      case 'start-health-5':
      case 'start-health-6':
      case 'start-health-7':
      case 'start-health-8':
      case 'start-health-9':
      case 'start-health-10':
      case 'start-health-11':
      case 'start-health-12':
      case 'start-health-13':
      case 'start-health-14':
      case 'start-health-15':
        const healthValue = parseInt(button.dataset.value);
        startingHealth = healthValue;
        document.querySelectorAll('.health-selector .minecraft-button').forEach(btn => {
          btn.removeAttribute('data-selected');
        });
        button.setAttribute('data-selected', 'true');
        break;

      case 'start-hunger-1':
      case 'start-hunger-2':
      case 'start-hunger-3':
      case 'start-hunger-4':
      case 'start-hunger-5':
      case 'start-hunger-6':
      case 'start-hunger-7':
      case 'start-hunger-8':
      case 'start-hunger-9':
      case 'start-hunger-10':
      case 'start-hunger-11':
      case 'start-hunger-12':
      case 'start-hunger-13':
      case 'start-hunger-14':
      case 'start-hunger-15':
        const hungerValue = parseInt(button.dataset.value);
        startingHunger = hungerValue;
        document.querySelectorAll('.hunger-selector .minecraft-button').forEach(btn => {
          btn.removeAttribute('data-selected');
        });
        button.setAttribute('data-selected', 'true');
        break;

      case 'resume-game':
        this.resumeGame();
        break;
      case 'pause-options':
        this.showMenu('optionsMenu');
        break;

      case 'pause-back-to-main':
        this.showMainMenu();
        break;

      case 'toggle-advanced-options':
        this.toggleAdvancedOptions();
        break;
      case 'back-to-mods':
        this.showMenu('modsMenu');
        break;
      case 'toggle-mod':
        this.toggleMod();
        break;
      case 'apply-skin':
        this.applySkin();
        break;
    }
  }

  updateButtonGroup(clickedButton, ...buttonActions) {
    buttonActions.forEach(action => {
      const button = document.querySelector(`[data-action="${action}"]`);
      if (button) {
        button.removeAttribute('data-selected');
      }
    });

    clickedButton.setAttribute('data-selected', 'true');
  }

  toggleAdvancedOptions() {
    const advancedOptions = document.querySelector('.advanced-options');
    const toggleButton = document.querySelector('[data-action="toggle-advanced-options"]');
    const toggleText = toggleButton.querySelector('.toggle-text');
    const toggleIcon = toggleButton.querySelector('.toggle-icon');

    if (advancedOptions.classList.contains('hidden')) {
      advancedOptions.classList.remove('hidden');
      toggleButton.setAttribute('data-expanded', 'true');
      toggleText.textContent = 'Hide Advanced Options';
    } else {
      advancedOptions.classList.add('hidden');
      toggleButton.removeAttribute('data-expanded');
      toggleText.textContent = 'Show Advanced Options';
    }
  }

  bindFormInputs() {
    const worldNameInput = document.getElementById('worldName');
    if (worldNameInput) {
      worldNameInput.addEventListener('input', (e) => {
        worldName = e.target.value;
      });
    }

    this.initializeKeybindButtons();

    const worldSeedInput = document.getElementById('worldSeed');
    if (worldSeedInput) {
      worldSeedInput.addEventListener('input', (e) => {
        worldSeed = e.target.value;
      });
    }

    const cheatsCheckbox = document.getElementById('cheatsEnabled');
    if (cheatsCheckbox) {
      cheatsCheckbox.addEventListener('change', (e) => {
        worldCheatsEnabled = e.target.checked;
      });
    }

    const commandsCheckbox = document.getElementById('allowCommands');
    if (commandsCheckbox) {
      commandsCheckbox.addEventListener('change', (e) => {
        worldAllowCommands = e.target.checked;
      });
    }

    const structuresCheckbox = document.getElementById('generateStructures');
    if (structuresCheckbox) {
      structuresCheckbox.addEventListener('change', (e) => {
        worldGenerateStructures = e.target.checked;
      });
    }

    if (worldNameInput) worldNameInput.value = worldName;
    if (worldSeedInput) worldSeedInput.value = worldSeed;
    if (cheatsCheckbox) cheatsCheckbox.checked = worldCheatsEnabled;
    if (commandsCheckbox) commandsCheckbox.checked = worldAllowCommands;
    if (structuresCheckbox) structuresCheckbox.checked = worldGenerateStructures;
    
    document.querySelectorAll('.health-selector .minecraft-button').forEach(btn => {
      btn.removeAttribute('data-selected');
    });
    const healthButton = document.querySelector(`.health-selector [data-value="${startingHealth}"]`);
    if (healthButton) healthButton.setAttribute('data-selected', 'true');
    
    document.querySelectorAll('.hunger-selector .minecraft-button').forEach(btn => {
      btn.removeAttribute('data-selected');
    });
    const hungerButton = document.querySelector(`.hunger-selector [data-value="${startingHunger}"]`);
    if (hungerButton) hungerButton.setAttribute('data-selected', 'true');
  }

  bindSliders() {
    document.querySelectorAll('.minecraft-slider').forEach(slider => {
      slider.addEventListener('input', () => syncSliderFill(slider));
    });

    const masterVolumeSlider = document.getElementById('masterVolume');
    const masterVolumeValue = document.getElementById('masterVolumeValue');
    if (masterVolumeSlider && masterVolumeValue) {
      masterVolumeSlider.addEventListener('input', (e) => {
        masterVolume = parseInt(e.target.value);
        masterVolumeValue.textContent = masterVolume;
        updateMusicVolume();
        
        prefs.set('underwild_masterVolume', masterVolume);
      });
    }

    const musicVolumeSlider = document.getElementById('musicVolume');
    const musicVolumeValue = document.getElementById('musicVolumeValue');
    if (musicVolumeSlider && musicVolumeValue) {
      musicVolumeSlider.addEventListener('input', (e) => {
        musicVolume = parseInt(e.target.value);
        musicVolumeValue.textContent = musicVolume;
        updateMusicVolume();
        
        prefs.set('underwild_musicVolume', musicVolume);
      });
    }

    const sfxVolumeSlider = document.getElementById('sfxVolume');
    const sfxVolumeValue = document.getElementById('sfxVolumeValue');
    if (sfxVolumeSlider && sfxVolumeValue) {
      sfxVolumeSlider.addEventListener('input', (e) => {
        sfxVolume = parseInt(e.target.value);
        sfxVolumeValue.textContent = sfxVolume;
        prefs.set('underwild_sfxVolume', sfxVolume);
      });
    }

    const musicTrackItems = document.querySelectorAll('.music-track-item');
    if (musicTrackItems.length > 0) {
      updateMusicTrackSelection();
      
      musicTrackItems.forEach(item => {
        item.addEventListener('click', () => {
          const trackId = item.getAttribute('data-track');
          if (musicTracks[trackId]) {
            switchMusicTrack(trackId);
            updateMusicTrackSelection();
          }
        });
      });
    }

    const mouseSensitivitySlider = document.getElementById('mouseSensitivity');
    const mouseSensitivityValue = document.getElementById('mouseSensitivityValue');
    if (mouseSensitivitySlider && mouseSensitivityValue) {
      mouseSensitivitySlider.addEventListener('input', (e) => {
        mouseSensitivity = parseInt(e.target.value);
        mouseSensitivityValue.textContent = mouseSensitivity;
      });
    }
  }

  resetSessionState() {
    if (world) world.dispose();
    world = null;
    player = null;
    items.length = 0;
    leafParticles.length = 0;
    explosionFX.clear();
    primedExplosives.length = 0;
    inventory.clear();
    inventoryCraftGrid.fill(null);
    craftGrid.fill(null);
    craftOutput = null;
    craftMatch = null;
    openContainer = null;
    draggingStack = null;
    inventoryOpen = false;
    gamePaused = false;
    noClipMode = false;
    gameSpeed = 1;
    setPosition1 = null;
    setPosition2 = null;
    fillPos1 = null;
    fillPos2 = null;
    selectedIndex = 0;
    lastPreloadChunk = null;
    tpVisited.clear();
    creativeCategoriesCache = null;
    renderedCreativeTab = null;
    breaker.cancel();
    if (textInputMode) closeChat();
  }

  createSessionWorld(width, height, seed) {
    world = new World(width, height, registry, seed);
    world.items = items;
    world.maxLoadedChunks = Math.max(30, (CHUNK_RENDER_DISTANCE + 2) * 2 + 1);
    world.onBlockChanged = () => saveManager.markDirty();
    // Decaying leaves drift down as a falling leaf.
    world.onLeafDecayed = (leafId, x, y) => {
      if (!renderFallingLeaves || leafParticles.length > 90) return;
      leafParticles.push(new LeafParticle(leafId, (x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, world.time, 0.7 + Math.random() * 0.4));
    };
    return world;
  }

  createSessionPlayer(x, y) {
    player = new Player(world, registry, x, y, prefs.get('playerUsername') || 'Player');
    player.keybinds = keybinds;
    player.autoJump = autoJump;
    player.fallDamageEnabled = !creativeMode;
    player.skin = prefs.get('playerSelectedSkin') || 'steve';
    return player;
  }

  attachRenderer() {
    window.renderer.world = world;
    window.renderer.player = player;
    window.renderer.inventory = inventory;
    window.renderer.breaker = breaker;
    window.renderer.getUI = getRendererUI;
  }

  beginSession() {
    document.querySelectorAll('.menu-container').forEach(menu => menu.classList.add('hidden'));
    this.currentMenu = null;
    canvas.style.display = 'block';

    const head = player.getHeadAnchor();
    camera.followTo(head.x, head.y, canvas, world);

    saveManager.setWorldName(currentWorldSaveName);
    saveManager.startAutoSave(getSaveState);

    initializeGameEngine();
    isLoading = false;
    engine.start();
    setTimeout(() => startBackgroundMusic(), 500);
  }

  failSession(message) {
    isLoading = false;
    this.resetSessionState();
    alert(message);
    this.showMenu('mainMenu');
  }

  async getUniqueWorldName(baseName) {
    let name = baseName;
    for (let i = 2; await saveManager.worldExists(name); i++) {
      name = `${baseName} (${i})`;
    }
    return name;
  }

  async createWorld() {
    if (isLoading) return;
    isLoading = true;
    document.querySelectorAll('.menu-container').forEach(menu => menu.classList.add('hidden'));

    try {
      this.resetSessionState();

      const trimmedSeed = String(worldSeed || '').trim();
      const parsedSeed = parseInt(trimmedSeed, 10);
      currentSeed = trimmedSeed && trimmedSeed !== 'Random' && !Number.isNaN(parsedSeed)
        ? parsedSeed
        : Math.floor(Math.random() * 1000000);

      const sizeMap = { tiny: 500, small: 1000, normal: 2000, large: 4000 };
      this.createSessionWorld(sizeMap[worldSize] || 2000, 200, currentSeed);
      world.worldType = worldType || 'regular';
      world.cheatsEnabled = worldCheatsEnabled;
      world.allowCommands = worldAllowCommands;
      world.difficulty = worldDifficulty;
      if (worldType === 'superflat') world.superflatLayers = worldSuperflatLayers.map(layer => ({ ...layer }));

      creativeMode = worldGameMode === 'creative';
      world.creativeMode = creativeMode;

      const timeMap = { day: 0.5, night: 0.0, sunset: 0.75, dawn: 0.25 };
      world.time = (timeMap[worldStartingTime] ?? 0.5) * world.dayLength;

      if (window.modManager) window.modManager.initialize(registry, world);

      spawnTileX = Math.floor(world.width / 2);
      this.createSessionPlayer(spawnTileX * TILE_SIZE, 0);
      player.maxHealth = startingHealth;
      player.health = startingHealth;
      player.maxHunger = startingHunger;
      player.hunger = startingHunger;
      this.attachRenderer();

      await loadInitialChunks(spawnTileX);
      if (!world.isChunkLoaded(world.chunkXFor(spawnTileX))) throw new Error('Failed to load initial chunks');
      placePlayerAtSurface(spawnTileX);

      currentWorldSaveName = await this.getUniqueWorldName(worldName.trim() || 'New World');
      this.beginSession();
      saveCurrentWorld();
    } catch (error) {
      console.error('Error creating world:', error);
      this.failSession(`Failed to create world: ${error.message}`);
    }
  }

  async loadSavedWorld(saveName) {
    if (!saveName || isLoading) return;
    isLoading = true;
    document.querySelectorAll('.menu-container').forEach(menu => menu.classList.add('hidden'));

    try {
      const savedData = await saveManager.load(saveName);
      if (!savedData) throw new Error('Save file not found or unreadable.');

      this.resetSessionState();
      const { worldWidth, worldHeight, worldMeta, chunkData, playerData, inventoryData, itemEntities } = savedData;

      currentSeed = worldMeta.currentSeed ?? worldMeta.seed ?? 0;
      worldGameMode = worldMeta.gameMode || 'survival';
      creativeMode = worldMeta.creativeMode ?? worldGameMode === 'creative';

      this.createSessionWorld(worldWidth, worldHeight, worldMeta.seed ?? currentSeed);
      world.worldType = worldMeta.worldType || 'regular';
      world.superflatLayers = worldMeta.superflatLayers || null;
      world.time = worldMeta.time || 0;
      world.timeManuallySet = !!worldMeta.timeManuallySet;
      world.cheatsEnabled = !!worldMeta.cheatsEnabled;
      world.allowCommands = !!worldMeta.allowCommands;
      world.difficulty = worldMeta.difficulty || 'normal';
      world.creativeMode = creativeMode;

      const expectedLength = world.chunkSize * world.height;
      for (const [cx, cells] of chunkData) {
        if (cells.length === expectedLength) world._savedChunks.set(cx, cells);
      }

      if (window.modManager) window.modManager.initialize(registry, world);

      spawnTileX = Math.floor(world.width / 2);
      this.createSessionPlayer(playerData.x ?? spawnTileX * TILE_SIZE, playerData.y ?? 0);
      player.maxHealth = playerData.maxHealth ?? player.maxHealth;
      player.health = playerData.health ?? player.maxHealth;
      player.maxHunger = playerData.maxHunger ?? player.maxHunger;
      player.hunger = playerData.hunger ?? player.maxHunger;
      player.creativeFlying = !!playerData.creativeFlying;
      player.isFlying = !!playerData.isFlying;

      inventory.deserialize(inventoryData);
      selectedIndex = Math.max(0, Math.min(8, playerData.selectedIndex ?? 0));

      for (const ent of itemEntities) {
        if (!ent.blockId) continue;
        const cx = world.chunkXFor(Math.floor(ent.x / TILE_SIZE));
        world._savedEntities.set(cx, (world._savedEntities.get(cx) || []).concat(ent));
      }

      this.attachRenderer();
      currentWorldSaveName = saveName;

      await loadInitialChunks(Math.floor(player.x / TILE_SIZE));
      ensurePlayerNotInSolid();
      player.spawnPoint = { x: spawnTileX * TILE_SIZE, y: (findSurfaceY(spawnTileX) * TILE_SIZE) - player.height - 1 };

      this.beginSession();
    } catch (error) {
      console.error('Error loading saved world:', error);
      this.failSession('Failed to load world: ' + error.message);
    }
  }

  async showWorldList() {
    const worlds = await saveManager.listWorlds();
    const modsGrid = document.getElementById('modsGrid');
    if (!modsGrid) return;

    this.showMenu('modsMenu');
    const titleEl = document.querySelector('#modsMenu .menu-title');
    if (titleEl) titleEl.textContent = 'Select World';

    modsGrid.innerHTML = '';
    if (worlds.length === 0) {
      modsGrid.innerHTML = '<div class="no-mods-message"><p>No saved worlds</p><p style="font-size: 14px; color: #888;">Create a new world to get started</p></div>';
      return;
    }

    for (const w of worlds) {
      const item = document.createElement('div');
      item.className = 'mod-grid-item';
      item.innerHTML = `
        <div class="mod-thumbnail world-thumb">W</div>
        <div class="mod-info">
          <div class="mod-name"></div>
          <div class="mod-version"></div>
        </div>
      `;
      item.querySelector('.mod-name').textContent = w.name || w.fileName;
      item.querySelector('.mod-version').textContent = `Seed: ${w.seed || 'Random'} | ${w.gameMode || 'survival'}`;
      item.addEventListener('click', () => this.loadSavedWorld(w.fileName.replace(/\.json$/, '')));
      modsGrid.appendChild(item);
    }
  }

  showMainMenu() {
    if (engine) engine.stop();
    saveManager.stopAutoSave();
    const state = getSaveState();
    if (state) saveManager.saveSync(state.world, state.player, state.items, state.inventory, state.meta);
    currentWorldSaveName = null;
    saveManager.setWorldName(null);
    this.resetSessionState();
    if (window.renderer) {
      window.renderer.world = null;
      window.renderer.player = null;
    }
    this.showMenu('mainMenu');
    updateHTMLUI();
  }

  showPauseMenu() {
    if (inventoryOpen || openContainer) closeInventory();
    gamePaused = true;
    breaker.cancel();
    this.showMenu('pauseMenu');
    saveCurrentWorld();
  }

  resumeGame() {
    this.showMenu(null);
    gamePaused = false;
  }

  populateModsMenu() {
    const modsGrid = document.getElementById('modsGrid');
    if (!modsGrid) return;
    const titleEl = document.querySelector('#modsMenu .menu-title');
    if (titleEl) titleEl.textContent = 'Mods';
    modsGrid.innerHTML = '';
    if (!window.modManager) return;
    for (const mod of window.modManager.getAllMods()) {
      modsGrid.appendChild(this.createModCard(mod));
    }
  }

  createModCard(mod) {
    const card = document.createElement('div');
    card.className = 'mod-card';
    if (window.modManager && window.modManager.isModEnabled(mod.id)) {
      card.classList.add('enabled');
    }
    const img = document.createElement('img');
    img.className = 'mod-thumbnail';
    img.src = mod.thumbnail || '';
    img.alt = mod.name || '';
    const name = document.createElement('div');
    name.className = 'mod-name';
    name.textContent = mod.name || 'Unknown Mod';
    card.append(img, name);
    card.addEventListener('click', () => this.showModDetails(mod));
    return card;
  }

  showModDetails(mod) {
    this.currentMod = mod;
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    const thumbnail = document.getElementById('modThumbnail');
    if (thumbnail) thumbnail.src = mod.thumbnail || '';
    setText('modName', mod.name || 'Unknown Mod');
    setText('modDescription', mod.description || 'No description available');
    setText('modVersion', `Version ${mod.version || '1.0.0'}`);
    setText('modAuthor', `by ${mod.author || 'Unknown'}`);

    const toggleButton = document.getElementById('modToggleButton');
    if (toggleButton) {
      const enabled = window.modManager && window.modManager.isModEnabled(mod.id);
      toggleButton.textContent = enabled ? 'Disable Mod' : 'Enable Mod';
      toggleButton.setAttribute('data-action', enabled ? 'disable-mod' : 'enable-mod');
    }
    this.showMenu('modDetailsMenu');
  }

  toggleMod() {
    if (!this.currentMod || !window.modManager) return;

    const action = document.getElementById('modToggleButton').getAttribute('data-action');

    if (action === 'enable-mod') {
      window.modManager.enableMod(this.currentMod.id);
      document.getElementById('modToggleButton').textContent = 'Disable Mod';
      document.getElementById('modToggleButton').setAttribute('data-action', 'disable-mod');
    } else {
      window.modManager.disableMod(this.currentMod.id);
      document.getElementById('modToggleButton').textContent = 'Enable Mod';
      document.getElementById('modToggleButton').setAttribute('data-action', 'enable-mod');
    }

    this.populateModsMenu();
  }

  applySkin() {
    const selectedSkinItem = document.querySelector('.skin-item.selected');
    if (!selectedSkinItem) return;

    const skinName = selectedSkinItem.getAttribute('data-skin');

    if (window.renderer && window.renderer.player) {
      window.renderer.player.skin = skinName;
    }

    prefs.set('playerSelectedSkin', skinName);

    const applyButton = document.querySelector('[data-action="apply-skin"]');
    if (applyButton) {
      const originalText = applyButton.textContent;
      applyButton.textContent = 'Applied!';
      setTimeout(() => {
        applyButton.textContent = originalText;
        this.showMenu(world && gamePaused ? 'pauseMenu' : 'mainMenu');
      }, 800);
    }
  }

  initializeSkinMenu() {
    const availableSkins = ['steve', 'alex', 'zombie', 'skeleton'];
    
    const skinsGrid = document.getElementById('skinsGrid');
    if (!skinsGrid) return;

    skinsGrid.innerHTML = '';

    availableSkins.forEach(skinName => {
      const skinItem = document.createElement('div');
      skinItem.className = 'skin-item';
      skinItem.setAttribute('data-skin', skinName);

      const skinPreview = document.createElement('div');
      skinPreview.className = 'skin-preview';
      skinPreview.innerHTML = `<img src="textures/${skinName}.png" alt="${skinName}" onerror="this.src='textures/steve.png';">`;

      const skinNameElement = document.createElement('div');
      skinNameElement.className = 'skin-name';
      skinNameElement.textContent = skinName.charAt(0).toUpperCase() + skinName.slice(1);

      skinItem.appendChild(skinPreview);
      skinItem.appendChild(skinNameElement);

      skinItem.addEventListener('click', () => {
        document.querySelectorAll('.skin-item').forEach(item => {
          item.classList.remove('selected');
        });
        
        skinItem.classList.add('selected');
      });

      skinsGrid.appendChild(skinItem);
    });

    const savedSkin = prefs.get('playerSelectedSkin');
    if (savedSkin) {
      const savedSkinItem = document.querySelector(`.skin-item[data-skin="${savedSkin}"]`);
      if (savedSkinItem) {
        document.querySelectorAll('.skin-item').forEach(item => {
          item.classList.remove('selected');
        });
        
        savedSkinItem.classList.add('selected');
      }
    }
  }

  startKeybindRebinding(action) {
    if (rebindingKey) return;
    rebindingKey = action;
    const button = document.querySelector(`[data-action="bind-${action}"]`);
    if (button) {
      button.classList.add('binding');
      button.textContent = '';
    }
    this.rebindingListener = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.finishKeybindRebinding(action, e.code);
    };
    document.addEventListener('keydown', this.rebindingListener, true);
  }

  finishKeybindRebinding(action, keyCode) {
    if (rebindingKey !== action) return;
    tempKeybinds[action] = keyCode;
    const button = document.querySelector(`[data-action="bind-${action}"]`);
    if (button) {
      button.classList.remove('binding');
      button.textContent = this.getKeyDisplayName(keyCode);
      button.setAttribute('data-key', keyCode);
      button.classList.add('modified');
    }
    if (this.rebindingListener) {
      document.removeEventListener('keydown', this.rebindingListener, true);
      this.rebindingListener = null;
    }
    setTimeout(() => { rebindingKey = null; }, 0);
  }

  applyKeybindChanges() {
    Object.assign(keybinds, tempKeybinds);

    saveKeybinds();

    document.querySelectorAll('.keybind-button.modified').forEach(button => {
      button.classList.remove('modified');
    });
  }

  getKeyDisplayName(keyCode) {
    const keyNames = {
      'KeyW': 'W', 'KeyA': 'A', 'KeyS': 'S', 'KeyD': 'D',
      'KeyE': 'E', 'KeyQ': 'Q', 'KeyR': 'R', 'KeyF': 'F',
      'KeyZ': 'Z', 'KeyT': 'T', 'Space': 'Space',
      'ShiftLeft': 'Shift', 'ShiftRight': 'Shift',
      'ControlLeft': 'Ctrl', 'ControlRight': 'Ctrl',
      'Escape': 'Esc'
    };
    return keyNames[keyCode] || keyCode.replace('Key', '');
  }

  resetKeybindsToDefault() {
    tempKeybinds = { ...DEFAULT_KEYBINDS };

    Object.entries(tempKeybinds).forEach(([action, keyCode]) => {
      const button = document.querySelector(`[data-action="bind-${action}"]`);
      if (button) {
        button.textContent = this.getKeyDisplayName(keyCode);
        button.setAttribute('data-key', keyCode);
        button.classList.add('modified');
      }
    });
  }

  initializeBackgroundUI() {
    if (backgroundBlocks.length === 0) {
      backgroundBlocks = ['dirt'];
      window.backgroundBlocks = backgroundBlocks;
    }

    this.updateBackgroundUI();
    this.bindBackgroundInput();
  }

  updateBackgroundUI() {
    const container = document.getElementById('backgroundBlocks');
    if (!container) return;
    container.innerHTML = '';
    const canRemove = backgroundBlocks.length > 1;

    backgroundBlocks.forEach((blockId, index) => {
      const slot = document.createElement('div');
      slot.className = 'inventory-slot bg-block-slot';
      slot.title = registry.get(blockId)?.displayName || blockId;

      const icon = document.createElement('img');
      icon.src = `textures/${blockId}.png`;
      icon.alt = '';
      icon.draggable = false;
      icon.onerror = () => { icon.onerror = null; icon.src = 'textures/stone.png'; };
      slot.appendChild(icon);

      if (canRemove) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'bg-block-remove';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove';
        removeBtn.addEventListener('click', () => this.removeBackgroundBlock(index));
        slot.appendChild(removeBtn);
      }
      container.appendChild(slot);
    });
  }


  removeBackgroundBlock(index) {
    if (index >= 0 && index < backgroundBlocks.length && backgroundBlocks.length > 1) {
      backgroundBlocks.splice(index, 1);
      window.backgroundBlocks = backgroundBlocks;
      this.updateBackgroundUI();
    }
  }

  bindBackgroundInput() {
    const input = document.getElementById('backgroundBlockInput');
    const suggestions = document.getElementById('backgroundSuggestions');
    if (!input || !suggestions || this.backgroundInputBound) return;
    this.backgroundInputBound = true;

    const refresh = () => this.showBlockSuggestions(input.value.trim().toLowerCase(), suggestions);
    input.addEventListener('input', refresh);
    input.addEventListener('focus', refresh);

    input.addEventListener('keydown', (e) => {
      const items = Array.from(suggestions.querySelectorAll('.suggestion-item'));
      const open = !suggestions.classList.contains('hidden') && items.length > 0;
      const current = items.findIndex(item => item.classList.contains('selected'));

      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && open) {
        e.preventDefault();
        const next = e.key === 'ArrowDown'
          ? (current + 1) % items.length
          : (current <= 0 ? items.length - 1 : current - 1);
        items.forEach(item => item.classList.remove('selected'));
        items[next].classList.add('selected');
        items[next].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        const chosen = open ? items[current >= 0 ? current : 0] : null;
        const blockId = chosen ? chosen.dataset.id : input.value.trim();
        if (!blockId) return;
        e.preventDefault();
        this.addBackgroundBlock(blockId);
        input.value = '';
        refresh();
      } else if (e.key === 'Escape') {
        suggestions.classList.add('hidden');
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (!input.contains(e.target) && !suggestions.contains(e.target)) {
        suggestions.classList.add('hidden');
      }
    });
  }


  showBlockSuggestions(query, suggestionsContainer) {
    suggestionsContainer.innerHTML = '';
    const matches = [];
    for (const [id, block] of registry.blocks()) {
      if (id === 'air' || backgroundBlocks.includes(id)) continue;
      const displayName = block.displayName || id;
      if (!query || id.toLowerCase().includes(query) || displayName.toLowerCase().includes(query)) {
        matches.push({ id, displayName });
      }
    }

    if (matches.length === 0) {
      suggestionsContainer.classList.add('hidden');
      return;
    }

    matches.forEach((block, index) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      if (index === 0 && query) item.classList.add('selected');
      item.dataset.id = block.id;
      item.innerHTML = `
        <img src="textures/${block.id}.png" alt="" class="suggestion-icon" onerror="this.onerror=null;this.src='textures/stone.png';">
        <div class="suggestion-text"><strong></strong> <span class="suggestion-id"></span></div>
      `;
      item.querySelector('strong').textContent = block.displayName;
      item.querySelector('.suggestion-id').textContent = block.id;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.addBackgroundBlock(block.id);
        const input = document.getElementById('backgroundBlockInput');
        input.value = '';
        this.showBlockSuggestions('', suggestionsContainer);
      });
      suggestionsContainer.appendChild(item);
    });
    suggestionsContainer.classList.remove('hidden');
  }


  addBackgroundBlock(blockId) {
    if (!blockId || !blockId.trim()) return;

    const trimmedId = blockId.trim();
    if (!registry.isBlock(trimmedId) || trimmedId === 'air') return;

    if (!backgroundBlocks.includes(trimmedId)) {
      backgroundBlocks.push(trimmedId);
      window.backgroundBlocks = backgroundBlocks;
      this.updateBackgroundUI();
    }
  }

  enableMod() {
    if (!this.currentMod || !window.modManager) return;

    window.modManager.enableMod(this.currentMod.id);
    const toggleButton = document.getElementById('modToggleButton');
    if (toggleButton) {
      toggleButton.textContent = 'Disable Mod';
      toggleButton.setAttribute('data-action', 'disable-mod');
    }

    this.populateModsMenu();
  }

  disableMod() {
    if (!this.currentMod || !window.modManager) return;
    window.modManager.disableMod(this.currentMod.id);
    const toggleButton = document.getElementById('modToggleButton');
    if (toggleButton) {
      toggleButton.textContent = 'Enable Mod';
      toggleButton.setAttribute('data-action', 'enable-mod');
    }

    this.populateModsMenu();
  }

  applyBackgroundChanges() {
    backgroundBlocks = backgroundBlocks.filter(id => id && id.trim());
    if (backgroundBlocks.length === 0) backgroundBlocks = ['dirt'];
    saveBackgroundConfig();
    if (window.renderer) window.renderer.menuBackgroundPatterns = null;

    const applyButton = document.querySelector('[data-action="apply-background"]');
    if (applyButton) {
      const originalText = applyButton.textContent;
      applyButton.textContent = 'Applied!';
      setTimeout(() => {
        applyButton.textContent = originalText;
        this.showMenu('optionsMenu');
      }, 800);
    }
  }

  initializeKeybindButtons() {
    tempKeybinds = { ...keybinds };

    Object.keys(keybinds).forEach(action => {
      const button = document.querySelector(`[data-action="bind-${action}"]`);
      if (button) {
        button.textContent = this.getKeyDisplayName(keybinds[action]);
        button.setAttribute('data-key', keybinds[action]);
        button.classList.remove('modified');
      }
    });
  }
}

const menuManager = new MenuManager();
window.menuManager = menuManager;

const RENDER_DISTANCE_CHUNKS = { tiny: 2, short: 4, normal: 6, far: 8, extreme: 12 };
let CHUNK_RENDER_DISTANCE = RENDER_DISTANCE_CHUNKS.normal;

canvas = document.getElementById('gameCanvas');
ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = Math.floor(window.devicePixelRatio * canvas.clientWidth);
  canvas.height = Math.floor(window.devicePixelRatio * canvas.clientHeight);
}
function ensureCSSSize() {
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
}
ensureCSSSize();
resizeCanvas();
window.addEventListener('resize', () => {
  ensureCSSSize();
  resizeCanvas();
});

input = new Input(canvas);
input.mouse.x = canvas.width / 2;
input.mouse.y = canvas.height / 2;

camera = new Camera();
window.camera = camera;

renderer = new Renderer(ctx, canvas, null, registry, camera, input, null, null, null, getRendererUI);
window.renderer = renderer;
window.backgroundBlocks = backgroundBlocks;
renderer.preloadTextures();

function menuRenderLoop() {
  if (!engine || !engine._running) {
    try {
      renderer.render();
    } catch (renderError) {
      console.error('Render error in menu loop:', renderError);
    }
  }
  requestAnimationFrame(menuRenderLoop);
}
requestAnimationFrame(menuRenderLoop);

modManager = new ModManager();
window.modManager = modManager;

let chatHistory = [];
let chatHistoryIndex = -1;

const availableCommands = [
  { cmd: 'give', usage: 'give <item> [amount]', needsItem: true },
  { cmd: 'giveall', usage: 'giveall <category>', needsCategory: true },
  { cmd: 'clear', usage: 'clear' },
  { cmd: 'mode', usage: 'mode <s|survival|c|creative|toggle>' },
  { cmd: 'time', usage: 'time <value> or time <HH:MM>' },
  { cmd: 'giverandom', usage: 'giverandom [count]' },
  { cmd: 'setpos1', usage: 'setpos1' },
  { cmd: 'setpos2', usage: 'setpos2' },
  { cmd: 'setposclear', usage: 'setposclear' },
  { cmd: 'fill', usage: 'fill <block> [type] [replaceBlock]', needsBlock: true },
  { cmd: 'tick', usage: 'tick <speed>' },
  { cmd: 'tp', usage: 'tp <x> <y> | tp <biome> | tp fallen | tp water' },
  { cmd: 'seed', usage: 'seed [newSeed]' },
  { cmd: 'itemconfig', usage: 'itemconfig [setting] [value]' },
  { cmd: 'fly', usage: 'fly <true|false>' },
  { cmd: 'noclip', usage: 'noclip' },
  { cmd: 'lighting', usage: 'lighting [recalc]' }
];

const itemCategories = {
  tools: ['wooden_sword', 'wooden_pickaxe', 'wooden_shovel', 'wooden_axe', 'trowel', 'copper_sword', 'copper_pickaxe', 'copper_shovel', 'copper_axe', 'steel_sword', 'steel_pickaxe', 'steel_shovel', 'steel_axe', 'gold_sword', 'gold_pickaxe', 'gold_shovel', 'gold_axe'],
  forging: ['copper_ingot_heated', 'copper_pickaxe_head', 'copper_pickaxe_head_heated', 'copper_axe_head', 'copper_axe_head_heated', 'copper_shovel_head', 'copper_shovel_head_heated', 'copper_sword_head', 'copper_sword_head_heated', 'steel_ingot_heated', 'steel_pickaxe_head', 'steel_pickaxe_head_heated', 'steel_axe_head', 'steel_axe_head_heated', 'steel_shovel_head', 'steel_shovel_head_heated', 'steel_sword_head', 'steel_sword_head_heated', 'gold_ingot_heated', 'gold_pickaxe_head', 'gold_pickaxe_head_heated', 'gold_axe_head', 'gold_axe_head_heated', 'gold_shovel_head', 'gold_shovel_head_heated', 'gold_sword_head', 'gold_sword_head_heated', 'forging_table', 'blacksmith_hammer', 'bucket', 'water_bucket'],
  woods: ['oak_log', 'birch_log', 'spruce_log', 'maple_log', 'pine_log'],
  planks: ['oak_planks', 'birch_planks', 'spruce_planks', 'maple_planks', 'pine_planks'],
  leaves: ['oak_leaves', 'birch_leaves', 'spruce_leaves', 'pine_leaves', 'maple_green_leaves', 'maple_orange_leaves', 'maple_red_leaves'],
  dirt: ['dirt', 'dirt_path', 'grass', 'sand', 'wet_sand', 'rippled_sand', 'cracked_sand', 'red_sand', 'red_rippled_sand', 'mud', 'coarse_dirt', 'gravel'],
  sandstone: ['sandstone', 'smooth_sandstone', 'cut_sandstone', 'chiseled_sandstone', 'red_sandstone', 'red_smooth_sandstone', 'red_cut_sandstone', 'red_chiseled_sandstone']
};

let commandSuggestions = [];
let selectedSuggestionIndex = -1;
let itemSuggestions = [];
let selectedItemIndex = -1;
let currentCommand = null;
let currentArgIndex = 0;

function restoreSavedEntities(chunkX) {
  if (!world) return;
  for (const s of world.fetchSavedEntitiesForChunk(chunkX)) {
    const it = new ItemEntity(s.blockId, s.x, s.y, world.time);
    it.vx = s.vx ?? 0;
    it.vy = s.vy ?? 0;
    it.life = s.life ?? 0;
    it.age = s.age ?? 0;
    it.count = s.count || 1;
    items.push(it);
  }
}

function findSurfaceY(tileX) {
  for (let y = 0; y < world.height; y++) {
    const id = world.isChunkLoaded(world.chunkXFor(tileX))
      ? world.getBlockId(tileX, y)
      : sampleBlockAt(tileX, y, world.seed ?? 0, world.height, world.width, world.worldType || 'regular', world.superflatLayers || null).id;
    const type = registry.get(id);
    if (type && type.solid) return y;
  }
  return Math.floor(world.height / 2);
}

function placePlayerAtSurface(tileX) {
  const surfaceY = findSurfaceY(tileX);
  player.x = tileX * TILE_SIZE + (TILE_SIZE - player.width) / 2;
  player.y = surfaceY * TILE_SIZE - player.height - 1;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.cancelFall();
  ensurePlayerNotInSolid();
  player.spawnPoint = { x: player.x, y: player.y };
}

function fillArea(x1, y1, x2, y2, blockId, fillType = 'solid', replaceBlock = null) {
  x1 = Math.max(0, Math.min(world.width - 1, x1));
  y1 = Math.max(0, Math.min(world.height - 1, y1));
  x2 = Math.max(0, Math.min(world.width - 1, x2));
  y2 = Math.max(0, Math.min(world.height - 1, y2));

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      let shouldPlace = false;

      switch (fillType) {
        case 'solid':
          shouldPlace = true;
          break;

        case 'hollow':

          shouldPlace = (x === minX || x === maxX || y === minY || y === maxY);
          break;

        case 'replace':

          const currentBlock = world.getBlockId(x, y);
          shouldPlace = (currentBlock === replaceBlock);
          break;

        default:
          shouldPlace = true;
          break;
      }

      if (shouldPlace) world.setBlock(x, y, blockId, null);
    }
  }
}

let spawnTileX = 100;

async function loadInitialChunks(originX) {
  const centerChunk = Math.floor(originX / world.chunkSize);
  const dist = Math.max(0, Math.floor(CHUNK_RENDER_DISTANCE)) + 1;
  const minChunk = Math.max(0, centerChunk - dist);
  const maxChunk = Math.min(Math.floor((world.width - 1) / world.chunkSize), centerChunk + dist);
  const loads = [];
  for (let cx = minChunk; cx <= maxChunk; cx++) {
    loads.push(world.loadChunkAsync(cx).then(() => restoreSavedEntities(cx)).catch(() => { }));
  }
  await Promise.all(loads);
}

function ensurePlayerNotInSolid() {
  if (!player) return;
  for (let i = 0; i < 40; i++) {
    const left = Math.floor(player.x / TILE_SIZE);
    const right = Math.floor((player.x + player.width - 1) / TILE_SIZE);
    const top = Math.floor(player.y / TILE_SIZE);
    const bottom = Math.floor((player.y + player.height - 1) / TILE_SIZE);
    let blocked = false;
    for (let tx = left; tx <= right && !blocked; tx++) {
      for (let ty = top; ty <= bottom; ty++) {
        if (world.inBounds(tx, ty) && world.isSolidAt(tx, ty)) {
          blocked = true;
          break;
        }
      }
    }
    if (!blocked) return;
    player.y -= TILE_SIZE;
    player.vy = 0;
  }
}

class Inventory {
  constructor(registry) {
    this.registry = registry;
    this.HOTBAR_SIZE = 9;
    this.TOTAL_SLOTS = 36;
    this.slots = Array.from({ length: this.TOTAL_SLOTS }, () => null);
  }

  getSlot(i) {
    return this.slots[i] ?? null;
  }

  setSlot(i, stack) {
    this.slots[i] = stack;
  }

  takeSlot(i) {
    const s = this.slots[i];
    this.slots[i] = null;
    return s;
  }

  clear() {
    this.slots.fill(null);
  }

  canMerge(a, b) {
    if (!a || !b || a.type !== b.type) return false;
    if (a.type === 'block') return a.blockId === b.blockId;
    if (a.type === 'item') return a.itemId === b.itemId;
    return false;
  }

  createStack(type, id, count) {
    const def = this.registry.get(id);
    return {
      type,
      [type === 'item' ? 'itemId' : 'blockId']: id,
      displayName: def?.displayName || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      count,
      maxStack: def?.maxStack ?? 64
    };
  }

  add(type, id, count) {
    const template = this.createStack(type, id, 0);
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      const s = this.slots[i];
      if (s && this.canMerge(s, template) && s.count < (s.maxStack ?? 64)) {
        const take = Math.min((s.maxStack ?? 64) - s.count, count);
        s.count += take;
        count -= take;
      }
    }
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(template.maxStack, count);
        this.slots[i] = { ...template, count: take };
        count -= take;
      }
    }
    return count;
  }

  addBlock(blockId, count = 1) {
    return this.add('block', blockId, count);
  }

  addItem(itemId, count = 1) {
    return this.add('item', itemId, count);
  }

  addById(id, count = 1) {
    return this.registry.isItem(id) ? this.addItem(id, count) : this.addBlock(id, count);
  }

  getCreativeCategories() {
    const categories = {
      building: { name: 'Building', items: [] },
      nature: { name: 'Nature', items: [] },
      tools: { name: 'Tools', items: [] },
      materials: { name: 'Materials', items: [] },
      functional: { name: 'Functional', items: [] }
    };

    for (const [id] of this.registry.blocks()) {
      if (id === 'air') continue;
      const stack = this.createStack('block', id, 1);
      if (id.includes('leaves') || id.includes('log') || id.includes('grass') || id.includes('dirt') ||
        id.includes('sand') || id.includes('gravel') || id.includes('water') || id.includes('fern') ||
        id.includes('flower') || id.includes('poppy') || id === 'mud') {
        categories.nature.items.push(stack);
      } else if (id.endsWith('_chest') || id === 'crafting_table' || id === 'furnace' || id.endsWith('torch') || id === 'trapdoor' || id === 'explosive' || id === 'ladder') {
        categories.functional.items.push(stack);
      } else if (id.endsWith('_ore') || id.includes('copper') || id.endsWith('_block')) {
        categories.materials.items.push(stack);
      } else {
        categories.building.items.push(stack);
      }
    }

    for (const [id, def] of this.registry.items()) {
      const stack = this.createStack('item', id, 1);
      if (def.type === 'tool') categories.tools.items.push(stack);
      else categories.materials.items.push(stack);
    }

    return categories;
  }

  serialize() {
    return this.slots.map(s => {
      if (!s) return null;
      return { type: s.type, blockId: s.blockId, itemId: s.itemId, count: s.count };
    });
  }

  deserialize(data) {
    this.clear();
    if (!Array.isArray(data)) return;
    const overflow = [];
    data.forEach((d, i) => {
      if (!d) return;
      const type = d.type === 'item' ? 'item' : 'block';
      const id = migrateLegacyId(type === 'item' ? d.itemId : d.blockId);
      if (!id) return;
      const stack = this.createStack(type, id, Math.max(1, d.count || 1));
      if (i < this.TOTAL_SLOTS) this.slots[i] = stack;
      else overflow.push(stack);
    });
    for (const stack of overflow) this.add(stack.type, stack.blockId || stack.itemId, stack.count);
  }
}

let inventoryOpen = false;
let selectedIndex = 0;
let noClipMode = false;
let creativeTab = 'building';
let textInputMode = false;
let textInputValue = '';
let showOutline = true;
let backgroundBuild = false;
let gamePaused = false;

inventory = new Inventory(registry);

function mergeSameToSlot(targetIndex) {
  const target = inventory.getSlot(targetIndex);
  if (!target) return false;
  const maxStack = target.maxStack ?? 64;
  let moved = false;
  for (let i = 0; i < inventory.TOTAL_SLOTS && target.count < maxStack; i++) {
    if (i === targetIndex) continue;
    const s = inventory.getSlot(i);
    if (!inventory.canMerge(target, s)) continue;
    const take = Math.min(maxStack - target.count, s.count);
    target.count += take;
    s.count -= take;
    moved = moved || take > 0;
    if (s.count <= 0) inventory.setSlot(i, null);
  }
  if (moved) recomputeCraft();
  return moved;
}

function throwSelectedBlock() {
  const hotSlot = inventory.getSlot(selectedIndex);
  if (!hotSlot) return;

  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  const dx = camera.screenToWorldX(input.mouse.x) - playerCenterX;
  const dy = camera.screenToWorldY(input.mouse.y) - playerCenterY;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 0.001 ? dx / dist : 0;
  const ny = dist > 0.001 ? dy / dist : -1;

  const spawnOffset = Math.max(TILE_SIZE * 0.9, player.width * 1.1);
  const spawnX = playerCenterX + nx * spawnOffset;
  let spawnY = playerCenterY + ny * spawnOffset;
  for (let i = 0; i < 6; i++) {
    const tx = Math.floor(spawnX / TILE_SIZE);
    const ty = Math.floor(spawnY / TILE_SIZE);
    if (!world.inBounds(tx, ty)) break;
    const bt = world.getBlockType(tx, ty);
    if (!bt || !bt.solid) break;
    spawnY -= TILE_SIZE * 0.25;
  }

  if (!spawnItemEntity(stackId(hotSlot), spawnX, spawnY, 1, nx * 3, ny * 3)) return;
  hotSlot.count -= 1;
  if (hotSlot.count <= 0) inventory.setSlot(selectedIndex, null);
}

let fillPos1 = null;
let fillPos2 = null;

placer = new Placer(registry);
breaker = new Breaker(registry);

inventoryCraftGrid = Array.from({ length: 4 }, () => null);
craftGrid = Array.from({ length: 9 }, () => null);
craftOutput = null;
craftMatch = null;

function updateCommandSuggestions() {
  commandSuggestions = [];
  selectedSuggestionIndex = -1;
  itemSuggestions = [];
  selectedItemIndex = -1;

  if (!textInputValue.startsWith('/')) {
    const suggestionsDropdown = document.getElementById('chatSuggestions');
    if (suggestionsDropdown) {
      suggestionsDropdown.classList.add('hidden');
    }
    return;
  }

  const parts = textInputValue.slice(1).split(' ');
  const commandPart = parts[0].toLowerCase();

  if (parts.length === 1) {
    if (commandPart.length === 0) {
      commandSuggestions = [...availableCommands];
    } else {
      commandSuggestions = availableCommands.filter(cmd =>
        cmd.cmd.toLowerCase().startsWith(commandPart) ||
        cmd.cmd.toLowerCase().includes(commandPart)
      );
    }

    commandSuggestions = commandSuggestions.slice(0, 8);
  } else {
    const command = availableCommands.find(cmd => cmd.cmd === commandPart);
    if (command) {
      currentCommand = command;
      currentArgIndex = parts.length - 2;

      commandSuggestions = [command];

      if (command.needsItem && currentArgIndex === 0) {
        const allItems = [];
        for (const [id, def] of registry.entries()) {
          if (id !== 'air') allItems.push({ id, type: def.isItem ? 'item' : 'block', displayName: def.displayName || id });
        }

        const currentArg = parts[1].toLowerCase();
        itemSuggestions = allItems.filter(item =>
          item.id.toLowerCase().startsWith(currentArg) ||
          item.displayName.toLowerCase().includes(currentArg)
        );

        itemSuggestions = itemSuggestions.slice(0, 10);
      } else if (command.needsCategory && currentArgIndex === 0) {
        const currentArg = parts[1].toLowerCase();
        itemSuggestions = Object.keys(itemCategories).filter(category =>
          category.toLowerCase().startsWith(currentArg)
        ).map(category => ({ id: category, type: 'category', displayName: category }));
      } else if (command.needsBlock && currentArgIndex === 0) {
        const currentArg = parts[1].toLowerCase();
        const allBlocks = [];

        for (const [id, block] of registry.blocks()) {
          if (id !== 'air') {
            allBlocks.push({ id, type: 'block', displayName: block.displayName || id });
          }
        }

        itemSuggestions = allBlocks.filter(block =>
          block.id.toLowerCase().startsWith(currentArg) ||
          block.displayName.toLowerCase().includes(currentArg)
        );

        itemSuggestions = itemSuggestions.slice(0, 10);
      }
    } else {
      commandSuggestions = availableCommands.filter(cmd =>
        cmd.cmd.toLowerCase().startsWith(commandPart) ||
        cmd.cmd.toLowerCase().includes(commandPart)
      ).slice(0, 8);
    }
  }

  const suggestionsDropdown = document.getElementById('chatSuggestions');
  if (suggestionsDropdown) {
    suggestionsDropdown.innerHTML = '';
    
    if (commandSuggestions.length > 0 && itemSuggestions.length === 0) {
      commandSuggestions.forEach((suggestion, index) => {
        const suggestionItem = document.createElement('div');
        suggestionItem.className = 'suggestion-item';
        if (index === selectedSuggestionIndex) {
          suggestionItem.classList.add('selected');
        }
        
        let params = '';
        if (suggestion.usage) {
          const usageParts = suggestion.usage.split(' ');
          if (usageParts[0] === suggestion.cmd) {
            params = usageParts.slice(1).join(' ');
          } else {
            params = suggestion.usage;
          }
        }
        
        let formattedParams = params;
        if (formattedParams) {
          formattedParams = formattedParams.replace(/<([^>]+)>/g, '($1)').replace(/\[([^\]]+)\]/g, '($1)');
        }
        
        suggestionItem.innerHTML = `
          <div class="suggestion-text">
            <strong>/${suggestion.cmd}</strong> ${formattedParams ? formattedParams : ''}
          </div>
        `;
        
        suggestionItem.addEventListener('click', () => {
          applySuggestion(suggestionItem);
          document.getElementById('chatInput')?.focus();
        });
        
        suggestionsDropdown.appendChild(suggestionItem);
      });
      
      suggestionsDropdown.classList.remove('hidden');
    } else if (itemSuggestions.length > 0) {
      itemSuggestions.forEach((suggestion, index) => {
        const suggestionItem = document.createElement('div');
        suggestionItem.className = 'suggestion-item';
        if (index === selectedItemIndex) {
          suggestionItem.classList.add('selected');
        }
        
        suggestionItem.dataset.id = suggestion.id;
        suggestionItem.innerHTML = `
          <img src="textures/${suggestion.id}.png" alt="" class="suggestion-icon" onerror="this.src='textures/stone.png';">
          <div class="suggestion-text">
            <strong>${suggestion.displayName || suggestion.id}</strong> <span class="suggestion-id">${suggestion.id}</span>
          </div>
        `;
        suggestionItem.addEventListener('click', () => {
          applySuggestion(suggestionItem);
          document.getElementById('chatInput')?.focus();
        });
        
        suggestionsDropdown.appendChild(suggestionItem);
      });
      
      suggestionsDropdown.classList.remove('hidden');
    } else {
      suggestionsDropdown.classList.add('hidden');
    }
  }
}

function parseCoord(coord, defaultValue) {
  if (coord === undefined || coord === '~') return defaultValue;
  if (coord.startsWith('~')) {
    const offset = Number(coord.slice(1));
    return Number.isNaN(offset) ? defaultValue : defaultValue + offset;
  }
  const parsed = Number(coord);
  return Number.isNaN(parsed) ? defaultValue : Math.floor(parsed);
}

function parseFillMode(type, replaceArg) {
  if (type === 'hollow') return { fillType: 'hollow', replaceBlock: null };
  if (type === 'replace' && replaceArg) return { fillType: 'replace', replaceBlock: replaceArg };
  return { fillType: 'solid', replaceBlock: null };
}

function setCreativeMode(enabled) {
  creativeMode = enabled;
  world.creativeMode = enabled;
  player.fallDamageEnabled = !enabled;
  creativeCategoriesCache = null;
  if (!enabled) {
    player.creativeFlying = false;
    player.isFlying = false;
  }
}

function giveById(id, amount) {
  if (!registry.has(id) || id === 'air') return;
  const leftover = inventory.addById(id, amount);
  if (leftover > 0) dropStackAtPlayer({ type: registry.isItem(id) ? 'item' : 'block', blockId: id, itemId: id }, leftover);
}

function commandsAllowed() {
  return !!(creativeMode || world?.allowCommands || world?.cheatsEnabled);
}

function processTextInputCommand(command) {
  const trimmed = command.trim();
  if (!trimmed || !world || !player || !commandsAllowed()) return;

  if (!trimmed.startsWith('/')) {
    const parts = trimmed.split(/\s+/);
    const count = parts.length > 1 ? parseInt(parts[1], 10) : 1;
    if (!Number.isNaN(count) && count > 0) giveById(parts[0], count);
    return;
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const playerTileX = Math.floor(player.x / TILE_SIZE);
  const playerTileY = Math.floor(player.y / TILE_SIZE);

  switch (cmd) {
    case 'give': {
      const amount = parts.length > 2 ? parseInt(parts[2], 10) : 1;
      if (parts[1] && !Number.isNaN(amount) && amount > 0) giveById(parts[1], amount);
      return;
    }

    case 'giveall': {
      const category = itemCategories[(parts[1] || '').toLowerCase()];
      if (!category) return;
      for (const id of category) giveById(id, registry.isItem(id) ? 1 : 64);
      return;
    }

    case 'clear':
      inventory.clear();
      return;

    case 'mode': {
      const mode = (parts[1] || '').toLowerCase();
      if (mode === 's' || mode === 'survival') setCreativeMode(false);
      else if (mode === 'c' || mode === 'creative') setCreativeMode(true);
      else if (mode === 'toggle' || mode === 't' || mode === '') setCreativeMode(!creativeMode);
      return;
    }

    case 'time': {
      const value = parts[1];
      if (!value) return;
      if (value === 'auto') {
        world.timeManuallySet = false;
        return;
      }
      let time;
      if (value.includes(':')) {
        const [hours, minutes] = value.split(':').map(v => parseInt(v, 10));
        if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return;
        time = (hours + minutes / 60) / 24;
      } else {
        time = parseFloat(value);
        if (Number.isNaN(time) || time < 0 || time > 1) return;
      }
      world.time = time * world.dayLength;
      world.timeManuallySet = true;
      return;
    }

    case 'giverandom': {
      const count = parts[1] ? parseInt(parts[1], 10) : 1;
      if (Number.isNaN(count) || count <= 0 || count > 100) return;
      const ids = Array.from(registry.map.keys()).filter(id => id !== 'air');
      for (let i = 0; i < count; i++) giveById(ids[Math.floor(Math.random() * ids.length)], 1);
      return;
    }

    case 'setpos1':
      setPosition1 = { x: playerTileX, y: Math.floor((player.y + player.height) / TILE_SIZE) };
      return;

    case 'setpos2':
      setPosition2 = { x: playerTileX, y: Math.floor((player.y + player.height) / TILE_SIZE) };
      return;

    case 'setposclear':
      setPosition1 = null;
      setPosition2 = null;
      return;

    case 'fill': {
      if (parts.length >= 6) {
        const blockId = parts[5];
        if (!registry.isBlock(blockId)) return;
        const { fillType, replaceBlock } = parseFillMode(parts[6], parts[7]);
        fillArea(parseCoord(parts[1], playerTileX), parseCoord(parts[2], playerTileY),
          parseCoord(parts[3], playerTileX), parseCoord(parts[4], playerTileY), blockId, fillType, replaceBlock);
        return;
      }
      const blockId = parts[1];
      if (!registry.isBlock(blockId) || !setPosition1) return;
      const end = setPosition2 || { x: playerTileX, y: playerTileY };
      const { fillType, replaceBlock } = parseFillMode(parts[2], parts[3]);
      fillArea(setPosition1.x, setPosition1.y, end.x, end.y, blockId, fillType, replaceBlock);
      return;
    }

    case 'fill1':
      fillPos1 = { x: Math.floor((player.x + player.width / 2) / TILE_SIZE), y: Math.floor((player.y + player.height / 2) / TILE_SIZE) };
      return;

    case 'fill2': {
      const blockId = parts[1];
      if (!fillPos1 || !registry.isBlock(blockId)) return;
      fillPos2 = { x: Math.floor((player.x + player.width / 2) / TILE_SIZE), y: Math.floor((player.y + player.height / 2) / TILE_SIZE) };
      fillArea(fillPos1.x, fillPos1.y, fillPos2.x, fillPos2.y, blockId);
      fillPos1 = null;
      fillPos2 = null;
      return;
    }

    case 'tick': {
      const val = parseFloat(parts[1]);
      if (!Number.isNaN(val) && val > 0) gameSpeed = val;
      return;
    }

    case 'tp':
      if (parts[1] && Number.isNaN(Number(parts[1])) && !parts[1].startsWith('~')) {
        // /tp fallen: jump next to the nearest fallen tree.
        // /tp <biome>: jump to the nearest edge of the closest zone of that biome.
        const query = parts.slice(1).join(' ').toLowerCase();
        const wantsFallen = ['fallen', 'fallen_tree', 'fallen tree', 'fallen_log', 'fallen log', 'log'].includes(query);
        const wantsWater = ['water', 'lake', 'beach'].includes(query);
        const biomeId = wantsFallen || wantsWater ? null : findBiomeId(query);
        if (!wantsFallen && !wantsWater && !biomeId) return;
        // Each repeat goes somewhere new: skip spots already teleported to (and the one you're in).
        const visitKey = wantsFallen ? 'fallen' : wantsWater ? 'water' : biomeId;
        const visited = tpVisited.get(visitKey) || new Set();
        tpVisited.set(visitKey, visited);
        let edgeX = null;
        if (wantsWater) {
          const found = nearestLakeX(playerTileX, world.seed ?? 0, world.width, world.height, world.worldType || 'regular',
            center => visited.has(center) || Math.abs(center - playerTileX) < 80);
          if (found) { visited.add(found.center); edgeX = found.standX; }
        } else if (wantsFallen) {
          const found = nearestFallenTreeX(playerTileX, world.seed ?? 0, world.width, world.height, world.worldType || 'regular', 30000,
            stumpX => visited.has(stumpX) || Math.abs(stumpX - playerTileX) <= 3);
          if (found) { visited.add(found.stumpX); edgeX = found.standX; }
        } else {
          const here = Math.floor(playerTileX / BIOME_ZONE);
          const outsideWorld = zone => zone * BIOME_ZONE < 2 || (zone + 1) * BIOME_ZONE > world.width - 2;
          edgeX = nearestBiomeEdge(playerTileX, world.seed ?? 0, biomeId, 400, zone => visited.has(zone) || zone === here || outsideWorld(zone));
          if (edgeX !== null) visited.add(Math.floor(edgeX / BIOME_ZONE));
        }
        if (edgeX === null) return;
        player.vx = 0;
        player.vy = 0;
        player.cancelFall();
        lastPreloadChunk = null;
        loadInitialChunks(edgeX).then(() => placePlayerAtSurface(edgeX));
        return;
      }
      player.x = parseCoord(parts[1], playerTileX) * TILE_SIZE;
      player.y = parseCoord(parts[2], playerTileY) * TILE_SIZE;
      player.vx = 0;
      player.vy = 0;
      player.onGround = false;
      player.cancelFall();
      lastPreloadChunk = null;
      loadInitialChunks(Math.floor(player.x / TILE_SIZE)).then(ensurePlayerNotInSolid);
      return;

    case 'fly': {
      const val = (parts[1] || '').toLowerCase();
      let flying = !player.creativeFlying;
      if (val === 'true' || val === '1') flying = true;
      else if (val === 'false' || val === '0') flying = false;
      if (flying && !creativeMode) setCreativeMode(true);
      player.creativeFlying = flying;
      player.isFlying = flying;
      if (!flying) player.vy = 0;
      return;
    }

    case 'noclip':
      noClipMode = !noClipMode;
      if (noClipMode && !creativeMode) setCreativeMode(true);
      return;

    case 'seed': {
      const newSeed = parseInt(parts[1], 10);
      if (Number.isNaN(newSeed)) return;
      currentSeed = newSeed;
      world.seed = newSeed;
      tpVisited.clear();
      world.resetChunks();
      items.length = 0;
      lastPreloadChunk = null;
      const centerX = Math.floor(world.width / 2);
      loadInitialChunks(centerX).then(() => {
        placePlayerAtSurface(centerX);
      });
      return;
    }

    case 'itemconfig': {
      if (parts.length !== 3) return;
      const value = parseFloat(parts[2]);
      if (Number.isNaN(value)) return;
      const keys = {
        pickuprange: ['pickupRange', v => v],
        attractionrange: ['attractionRange', v => v],
        attractionforce: ['attractionForce', v => v],
        pickupdelay: ['pickupDelay', v => Math.max(0, Math.floor(v))],
        gravity: ['gravity', v => v],
        maxlife: ['maxLife', v => Math.max(0, Math.floor(v))]
      };
      const entry = keys[parts[1].toLowerCase()];
      if (entry) ItemEntity.updateConfig({ [entry[0]]: entry[1](value) });
      return;
    }

    case 'lighting':
      if (parts[1] === 'recalc') world.initializeLighting();
      return;

    default:
      return;
  }
}

function recomputeCraft() {
  craftOutput = null;
  craftMatch = null;

  const grid = openContainer?.title === 'Crafting Table' ? craftGrid : inventoryCraftGrid;
  const is3x3 = openContainer?.title === 'Crafting Table';

  craftMatch = findMatchingRecipe(grid, is3x3);

  if (craftMatch) {
    craftOutput = createRecipeOutput(craftMatch, registry);
  }
}

function consumeCraftInputs(match) {
  if (!match) return false;

  const grid = openContainer?.title === 'Crafting Table' ? craftGrid : inventoryCraftGrid;
  const is3x3 = openContainer?.title === 'Crafting Table';

  const consumed = consumeRecipeIngredients(grid, match, is3x3);

  if (!consumed) return false;

  for (const index in consumed) {
    const consumedItem = consumed[index];
    const gridItem = grid[index];

    if (gridItem && gridItem.type === consumedItem.type) {
      if (consumedItem.type === 'block' && gridItem.blockId === consumedItem.blockId) {
        gridItem.count -= consumedItem.count;
        if (gridItem.count <= 0) {
          grid[index] = null;
        }
      } else if (consumedItem.type === 'item' && gridItem.itemId === consumedItem.itemId) {
        gridItem.count -= consumedItem.count;
        if (gridItem.count <= 0) {
          grid[index] = null;
        }
      }
    }
  }

  return true;
}

function tryPickupCraft() {
  if (!craftOutput || !craftMatch) return false;
  if (!draggingStack) {
    if (!consumeCraftInputs(craftMatch)) return false;
    draggingStack = { ...craftOutput };
    recomputeCraft();
    return true;
  } else if (inventory.canMerge(draggingStack, craftOutput)) {
    const room = (draggingStack.maxStack ?? 64) - draggingStack.count;
    if (room < craftOutput.count) return false;
    if (!consumeCraftInputs(craftMatch)) return false;
    draggingStack.count += craftOutput.count;
    recomputeCraft();
    return true;
  }
  return false;
}

function getMouseTileFromRaw(screenX, screenY) {
  const worldX = camera.screenToWorldX(screenX);
  const worldY = camera.screenToWorldY(screenY);
  
  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);
  
  return { worldX, worldY, tileX, tileY };
}
function getScreenCoordsFromEvent(e) {
  return {
    screenX: e.offsetX * (canvas.width / canvas.clientWidth),
    screenY: e.offsetY * (canvas.height / canvas.clientHeight),
  };
}

function getRendererUI() {
  return {
    selectedIndex,
    inventoryOpen,
    openContainer,
    draggingStack,
    craftGrid,
    inventoryCraftGrid,
    craftOutput,
    creativeMode,
    creativeTab,
    textInputMode,
    items,
    leafParticles,
    explosionFX,
    primedExplosives,
    backgroundBlocks,
    keybinds,
    showOutline,
    setPosition1,
    setPosition2,
    isLoading,
    gamePaused,
    renderFallingLeaves,
    textureQuality
  };
}

function getSessionMeta() {
  return {
    gameMode: worldGameMode,
    creativeMode,
    selectedIndex,
    currentSeed,
    displayName: currentWorldSaveName
  };
}

function getSaveState() {
  if (!world || !player || !currentWorldSaveName) return null;
  return { world, player, items, inventory, meta: getSessionMeta() };
}

function saveCurrentWorld() {
  const state = getSaveState();
  if (!state) return Promise.resolve(false);
  return saveManager.save(state.world, state.player, state.items, state.inventory, state.meta);
}

function isAnyMenuVisible() {
  return !!document.querySelector('.menu-container:not(.hidden)');
}

function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function stackId(stack) {
  return stack ? (stack.blockId || stack.itemId) : null;
}

function addStackToInventory(stack) {
  if (!stack || stack.count <= 0) return 0;
  return stack.type === 'item'
    ? inventory.addItem(stack.itemId, stack.count)
    : inventory.addBlock(stack.blockId, stack.count);
}

function spawnItemEntity(id, x, y, count = 1, vx = 0, vy = 0) {
  if (!id || count <= 0 || items.length >= ItemEntity.getConfig().maxItems) return null;
  const entity = new ItemEntity(id, x, y, world.time);
  entity.count = count;
  entity.vx = vx;
  entity.vy = vy;
  items.push(entity);
  return entity;
}

function dropStackAtPlayer(stack, count = stack?.count ?? 0) {
  if (!stack || !player || count <= 0) return;
  const dir = player.facingDirection || 1;
  spawnItemEntity(stackId(stack), player.x + player.width / 2 + dir * TILE_SIZE, player.y + player.height * 0.3, count, dir * 2, -1);
}

function returnStackToInventory(stack) {
  if (!stack) return;
  const leftover = addStackToInventory(stack);
  if (leftover > 0) dropStackAtPlayer(stack, leftover);
}

function closeInventory() {
  document.getElementById('creativeSearch')?.blur();
  returnStackToInventory(draggingStack);
  draggingStack = null;
  for (const grid of [inventoryCraftGrid, craftGrid]) {
    for (let i = 0; i < grid.length; i++) {
      returnStackToInventory(grid[i]);
      grid[i] = null;
    }
  }
  inventoryOpen = false;
  openContainer = null;
  recomputeCraft();
}

function openChest(tileX, tileY) {
  const cell = world.getCell(tileX, tileY);
  if (!cell.meta) cell.meta = {};

  let owner = cell;
  const chestId = world.getBlockId(tileX, tileY);
  if (cell.meta.chestType === 'right' && world.getBlockId(tileX - 1, tileY) === chestId) {
    const leftCell = world.getCell(tileX - 1, tileY);
    if (leftCell.meta && leftCell.meta.chestType === 'left') owner = leftCell;
  }

  const isDouble = owner.meta.chestType === 'left';
  const capacity = isDouble ? 54 : 27;
  if (!Array.isArray(owner.meta.inv) || owner.meta.inv.length < capacity) {
    const inv = Array.from({ length: capacity }, () => null);
    (owner.meta.inv || []).forEach((s, i) => { if (i < capacity) inv[i] = s; });
    owner.meta.inv = inv;
  }

  openContainer = {
    title: `${isDouble ? 'Large ' : ''}${registry.get(chestId)?.displayName || 'Chest'}`,
    slots: owner.meta.inv,
    capacity,
    tileX,
    tileY
  };
  inventoryOpen = true;
  recomputeCraft();
}

function openFurnace(tileX, tileY) {
  const cell = world.getCell(tileX, tileY);
  if (!cell.meta) cell.meta = {};
  ensureFurnaceMeta(cell.meta);
  openContainer = { title: 'Furnace', kind: 'furnace', slots: cell.meta.inv, meta: cell.meta, capacity: 3, tileX, tileY };
  inventoryOpen = true;
  recomputeCraft();
}

function openForge(tileX, tileY) {
  const cell = world.getCell(tileX, tileY);
  if (!cell.meta) cell.meta = {};
  if (!Array.isArray(cell.meta.inv) || cell.meta.inv.length < 2) cell.meta.inv = [cell.meta.inv?.[0] ?? null, cell.meta.inv?.[1] ?? null];
  openContainer = { title: 'Forging Table', kind: 'forge', slots: cell.meta.inv, meta: cell.meta, capacity: 3, choice: null, tileX, tileY };
  inventoryOpen = true;
  recomputeCraft();
}

// The heated head the forging table would make right now, or null.
function forgeOutput() {
  if (openContainer?.kind !== 'forge') return null;
  const [hammer, ingot] = openContainer.slots;
  const material = heatedIngotMaterial(stackId(ingot));
  if (stackId(hammer) !== 'blacksmith_hammer' || !material || !openContainer.choice) return null;
  const id = `${material}_${openContainer.choice}_head_heated`;
  if (!registry.get(id)) return null;
  // The head keeps the ingot's heat: it cools on the same clock.
  return { ...inventory.createStack('item', id, 1), heatedAt: ingot.heatedAt ?? Date.now() };
}

// Heated metal cools back down over HEAT_COOL_MS: a heated ingot turns back into an
// ingot, a heated head into a finished head. Cooling runs on real time, so stacks left in
// chests or furnaces have cooled by the time you look at them.
const HEAT_COOL_MS = 30000;
function coolStack(stack) {
  const id = stackId(stack);
  if (!id || !id.endsWith('_heated')) return stack;
  if (!stack.heatedAt) stack.heatedAt = Date.now();
  if (Date.now() - stack.heatedAt < HEAT_COOL_MS) return stack;
  const coolId = id.slice(0, -'_heated'.length);
  if (!registry.get(coolId)) return stack;
  return inventory.createStack(registry.isItem(coolId) ? 'item' : 'block', coolId, stack.count);
}
function coolHeatedStacks() {
  for (let i = 0; i < inventory.TOTAL_SLOTS; i++) {
    const s = inventory.getSlot(i);
    if (s) { const c = coolStack(s); if (c !== s) inventory.setSlot(i, c); }
  }
  if (draggingStack) draggingStack = coolStack(draggingStack);
  const slots = openContainer?.slots;
  if (Array.isArray(slots)) for (let i = 0; i < slots.length; i++) if (slots[i]) slots[i] = coolStack(slots[i]);
}

function getUIHitFromElement(element) {
  const el = element?.closest?.('.creative-tab, .creative-slot, .container-slot, .crafting-output-slot, .crafting-slot, .inventory-slot, .hotbar-slot');
  if (!el) return null;
  if (el.classList.contains('creative-tab')) return { area: 'creativeTab', tabId: el.dataset.tab };
  const index = Number(el.dataset.index);
  if (el.classList.contains('creative-slot')) return { area: 'creative', index };
  if (el.classList.contains('container-slot')) return { area: 'container', index };
  if (el.classList.contains('crafting-output-slot')) return { area: 'craftOut', index: 0 };
  if (el.classList.contains('crafting-slot')) return { area: 'craft', index };
  return { area: 'inventory', index };
}

function getActiveCraftGrid() {
  return openContainer?.title === 'Crafting Table' ? craftGrid : inventoryCraftGrid;
}

function getSlotRef(area, index) {
  if (area === 'inventory') {
    if (index < 0 || index >= inventory.TOTAL_SLOTS) return null;
    return { get: () => inventory.getSlot(index), set: (v) => inventory.setSlot(index, v) };
  }
  if (area === 'container' && openContainer?.slots && openContainer.title !== 'Crafting Table') {
    const slots = openContainer.slots;
    if (index < 0 || index >= (openContainer.kind === 'forge' ? 3 : slots.length)) return null;
    if (openContainer.kind === 'forge') {
      if (index === 2) {
        // The output is worked out from the inputs; taking it uses up the ingot.
        return {
          get: forgeOutput,
          accepts: () => false,
          set: (v) => {
            if (v) return;
            const ingot = slots[1];
            if (ingot && --ingot.count <= 0) slots[1] = null;
          }
        };
      }
      const ok = index === 0 ? (st) => stackId(st) === 'blacksmith_hammer' : (st) => !!heatedIngotMaterial(stackId(st));
      return { get: () => slots[index] ?? null, accepts: ok, set: (v) => { slots[index] = v; } };
    }
    if (openContainer.kind === 'furnace' && index === 2) {
      // The furnace output can only be taken from, never placed into.
      return {
        get: () => slots[2] ?? null,
        accepts: () => false,
        set: (v) => {
          const cur = slots[2];
          if (!v || (cur && stackId(v) === stackId(cur) && v.count < cur.count)) slots[2] = v;
        }
      };
    }
    return { get: () => slots[index] ?? null, set: (v) => { slots[index] = v; } };
  }
  if (area === 'craft') {
    const grid = getActiveCraftGrid();
    if (index < 0 || index >= grid.length) return null;
    return { get: () => grid[index], set: (v) => { grid[index] = v; } };
  }
  return null;
}

function moveStackInto(stack, slots, start, end) {
  for (let i = start; i < end && stack.count > 0; i++) {
    const target = slots[i];
    if (target && inventory.canMerge(target, stack)) {
      const take = Math.min((target.maxStack ?? 64) - target.count, stack.count);
      if (take > 0) {
        target.count += take;
        stack.count -= take;
      }
    }
  }
  for (let i = start; i < end && stack.count > 0; i++) {
    if (!slots[i]) {
      slots[i] = { ...stack };
      stack.count = 0;
    }
  }
}

function shiftClickTransfer(hit) {
  const ref = getSlotRef(hit.area, hit.index);
  const stack = ref?.get();
  if (!stack) return false;

  if (hit.area === 'inventory') {
    const chestSlots = openContainer && openContainer.title !== 'Crafting Table' ? openContainer.slots : null;
    if (openContainer?.kind === 'forge') {
      const id = stackId(stack);
      if (id === 'blacksmith_hammer') moveStackInto(stack, chestSlots, 0, 1);
      else if (heatedIngotMaterial(id)) moveStackInto(stack, chestSlots, 1, 2);
    } else if (openContainer?.kind === 'furnace') {
      // Smeltables go in the top slot, fuel in the bottom one.
      const id = stackId(stack);
      if (SMELTING[id]) moveStackInto(stack, chestSlots, 0, 1);
      else if (fuelTime(id) > 0) moveStackInto(stack, chestSlots, 1, 2);
    } else if (chestSlots) moveStackInto(stack, chestSlots, 0, chestSlots.length);
    else if (hit.index < 9) moveStackInto(stack, inventory.slots, 9, 36);
    else moveStackInto(stack, inventory.slots, 0, 9);
  } else {
    moveStackInto(stack, inventory.slots, 0, 36);
  }

  if (stack.count <= 0) ref.set(null);
  recomputeCraft();
  return true;
}

function craftAll() {
  if (!craftOutput || !craftMatch) return;
  const output = { ...craftOutput };
  let crafted = 0;
  for (let i = 0; i < 64; i++) {
    if (!craftMatch || stackId(craftOutput) !== stackId(output) || !consumeCraftInputs(craftMatch)) break;
    crafted += output.count;
    recomputeCraft();
  }
  if (crafted > 0) returnStackToInventory({ ...output, count: crafted });
  recomputeCraft();
}

function handleInventoryClick(hit, isRightClick = false) {
  if (hit.area === 'craftOut') {
    tryPickupCraft();
    return true;
  }

  if (hit.area === 'creativeTab') {
    if (creativeMode && hit.tabId) {
      creativeTab = hit.tabId;
      if (creativeTab === CREATIVE_SEARCH_TAB) setTimeout(() => document.getElementById('creativeSearch')?.focus(), 0);
    }
    return true;
  }

  if (hit.area === 'creative') {
    if (!creativeMode) return false;
    const item = getCreativeTabItems(creativeTab)[hit.index];
    if (!item) return false;
    if (draggingStack && inventory.canMerge(draggingStack, item)) {
      draggingStack.count = Math.min(draggingStack.maxStack ?? 64, draggingStack.count + 1);
    } else {
      draggingStack = { ...item, count: isRightClick ? 1 : (item.maxStack ?? 64) };
    }
    return true;
  }

  const slotRef = getSlotRef(hit.area, hit.index);
  if (!slotRef) return false;
  const slot = slotRef.get();

  // A slot that won't take what you're holding (a furnace or forge output, a forge input
  // for something else): click it to scoop up its contents onto your stack if they match.
  if (draggingStack && slotRef.accepts && !slotRef.accepts(draggingStack)) {
    if (slot && inventory.canMerge(slot, draggingStack) && draggingStack.count + slot.count <= (draggingStack.maxStack ?? 64)) {
      draggingStack.count += slot.count;
      slotRef.set(null);
    }
    return true;
  }

  if (!draggingStack) {
    if (!slot) return false;
    if (isRightClick && slot.count > 1) {
      const take = Math.ceil(slot.count / 2);
      draggingStack = { ...slot, count: take };
      slot.count -= take;
    } else {
      draggingStack = slot;
      slotRef.set(null);
    }
  } else if (!slot) {
    if (isRightClick) {
      slotRef.set({ ...draggingStack, count: 1 });
      draggingStack.count -= 1;
    } else {
      slotRef.set(draggingStack);
      draggingStack = null;
    }
  } else if (inventory.canMerge(slot, draggingStack)) {
    const room = (slot.maxStack ?? 64) - slot.count;
    const take = Math.min(room, isRightClick ? 1 : draggingStack.count);
    slot.count += take;
    draggingStack.count -= take;
  } else {
    slotRef.set(draggingStack);
    draggingStack = slot;
  }

  if (draggingStack && draggingStack.count <= 0) draggingStack = null;
  recomputeCraft();
  return true;
}

let lastClickTime = 0;
let lastClickSlot = null;
let dragStartSlot = null;
let lastPaintSlot = null;

window.addEventListener('mousedown', (e) => {
  if (!world || !(inventoryOpen || openContainer)) return;
  if (e.target.closest?.('#chat')) return;
  const hit = getUIHitFromElement(e.target);

  if (!hit) {
    if (draggingStack && e.target.closest?.('.inventory-overlay') && !e.target.closest('.inventory-content')) {
      const count = e.button === 2 ? 1 : draggingStack.count;
      dropStackAtPlayer(draggingStack, count);
      draggingStack.count -= count;
      if (draggingStack.count <= 0) draggingStack = null;
      recomputeCraft();
    }
    return;
  }

  e.preventDefault();
  const slotKey = `${hit.area}:${hit.index ?? hit.tabId}`;
  dragStartSlot = slotKey;
  lastPaintSlot = slotKey;

  if (e.button === 0 && e.shiftKey) {
    if (hit.area === 'craftOut') craftAll();
    else if (hit.area === 'creative') shiftClickCreative(hit.index);
    else if (hit.area !== 'creativeTab') shiftClickTransfer(hit);
    return;
  }

  if (e.button === 0 && hit.area === 'inventory') {
    const now = Date.now();
    if (now - lastClickTime < 300 && lastClickSlot === hit.index && !draggingStack) {
      mergeSameToSlot(hit.index);
      lastClickTime = 0;
      lastClickSlot = null;
      return;
    }
    lastClickTime = now;
    lastClickSlot = hit.index;
  }

  handleInventoryClick(hit, e.button === 2);
});

window.addEventListener('mousemove', (e) => {
  const draggingDiv = document.getElementById('dragging-item');
  if (draggingDiv && !draggingDiv.classList.contains('hidden')) {
    draggingDiv.style.left = e.clientX + 'px';
    draggingDiv.style.top = e.clientY + 'px';
  }

  if (!draggingStack || !(inventoryOpen || openContainer) || (e.buttons & 2) === 0) return;
  const hit = getUIHitFromElement(document.elementFromPoint(e.clientX, e.clientY));
  if (!hit || hit.area === 'craftOut' || hit.area === 'creative' || hit.area === 'creativeTab') return;
  const slotKey = `${hit.area}:${hit.index}`;
  if (slotKey === lastPaintSlot) return;
  lastPaintSlot = slotKey;
  const ref = getSlotRef(hit.area, hit.index);
  const slot = ref?.get();
  if (!ref || (ref.accepts && !ref.accepts(draggingStack))) return;
  if (!slot) {
    ref.set({ ...draggingStack, count: 1 });
    draggingStack.count -= 1;
  } else if (inventory.canMerge(slot, draggingStack) && slot.count < (slot.maxStack ?? 64)) {
    slot.count += 1;
    draggingStack.count -= 1;
  }
  if (draggingStack.count <= 0) draggingStack = null;
  recomputeCraft();
});

window.addEventListener('mouseup', (e) => {
  if (draggingStack && (inventoryOpen || openContainer) && e.button === 0 && dragStartSlot) {
    const hit = getUIHitFromElement(document.elementFromPoint(e.clientX, e.clientY));
    if (hit && `${hit.area}:${hit.index ?? hit.tabId}` !== dragStartSlot && hit.area !== 'creative' && hit.area !== 'creativeTab') {
      handleInventoryClick(hit, false);
    }
  }
  dragStartSlot = null;
  lastPaintSlot = null;
});

window.addEventListener('contextmenu', (e) => {
  if (e.target.closest?.('.inventory-overlay, #hotbar')) e.preventDefault();
});

canvas.addEventListener('mousedown', (e) => {
  if (world && player && !gamePaused && !isLoading && !inventoryOpen && !openContainer && e.button === 0) {
    const { screenX, screenY } = getScreenCoordsFromEvent(e);
    const { tileX, tileY } = getMouseTileFromRaw(screenX, screenY);
    const targetId = world.getBlockId(tileX, tileY);
    if (targetId === 'air' || NATURE_BLOCKS.has(targetId)) player.playArmAction('attack');
  }
  if (!world || !player || gamePaused || isLoading || inventoryOpen || openContainer || e.button !== 2) return;
  const { screenX, screenY } = getScreenCoordsFromEvent(e);
  let { tileX, tileY } = getMouseTileFromRaw(screenX, screenY);

  const clickedId = world.getBlockId(tileX, tileY);
  if (clickedId === 'crafting_table') {
    openContainer = { title: 'Crafting Table', slots: craftGrid, capacity: 9, tileX, tileY };
    inventoryOpen = true;
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
  if (clickedId === 'explosive') {
    registry.get('explosive').prime(world, tileX, tileY, explosionContext());
    return;
  }
  if (useBucket(tileX, tileY)) return;

  lastPlaceTime = performance.now();
  placeHeld = true;
  tryPlaceBlockAt(screenX, screenY);
});

// Buckets: an empty bucket scoops a full block of water; a water bucket pours it back out.
function useBucket(tileX, tileY) {
  const hotSlot = inventory.getSlot(selectedIndex);
  const held = hotSlot?.type === 'item' ? hotSlot.itemId : null;
  if ((held !== 'bucket' && held !== 'water_bucket') || !world.inBounds(tileX, tileY)) return false;
  const sim = world.water;
  if (held === 'bucket') {
    if (world.getBlockId(tileX, tileY) !== 'water') return false;
    // A bucket holds a full block (16 layers). Take it from the clicked cell if that's
    // full; otherwise from it and up to 2 cells either side on the same row, nearest first,
    // but only if together they make a full block.
    const full = 15 / 16;
    const cells = [[tileX, tileY]];
    // Each side stops at the first cell without water, so it only draws on connected water.
    for (const dir of [-1, 1]) {
      for (let d = 1; d <= 2 && world.getBlockId(tileX + dir * d, tileY) === 'water'; d++) cells.push([tileX + dir * d, tileY]);
    }
    cells.sort((p, q) => Math.abs(p[0] - tileX) - Math.abs(q[0] - tileX));
    let total = 0;
    for (const [x, y] of cells) total += Math.min(1, sim.mass(x, y));
    if (Math.min(1, sim.mass(tileX, tileY)) < full && total < full) return true;
    let need = 1;
    for (const [x, y] of cells) {
      if (need <= 0) break;
      const m = sim.mass(x, y);
      const take = Math.min(m, need);
      if (take > 0) sim.setMass(x, y, m - take, true);
      need -= take;
    }
    // In creative the empty bucket stays and a new water bucket is added each time.
    if (!creativeMode) hotSlot.count -= 1;
    if (hotSlot.count <= 0) inventory.setSlot(selectedIndex, { type: 'item', itemId: 'water_bucket', count: 1 });
    else {
      const leftover = inventory.addItem('water_bucket', 1);
      if (leftover > 0) dropStackAtPlayer({ type: 'item', itemId: 'water_bucket' }, leftover);
    }
    player.playArmAction('place');
    return true;
  }
  // Pour: fill the clicked cell, spilling anything that doesn't fit into the cell above.
  const id = world.getBlockId(tileX, tileY);
  if (id !== 'air' && id !== 'water' && !NATURE_BLOCKS.has(id)) return true;
  if (NATURE_BLOCKS.has(id)) world.setBlock(tileX, tileY, 'air', null);
  const here = sim.mass(tileX, tileY);
  const fit = Math.min(1, 1 - here);
  const aboveId = world.getBlockId(tileX, tileY - 1);
  const spill = 1 - fit;
  if (spill > 0.001 && aboveId !== 'air' && aboveId !== 'water') return true; // nowhere to pour
  sim.setMass(tileX, tileY, here + fit, true);
  if (spill > 0.001) sim.setMass(tileX, tileY - 1, sim.mass(tileX, tileY - 1) + spill, true);
  if (!creativeMode) inventory.setSlot(selectedIndex, { type: 'item', itemId: 'bucket', count: 1 });
  player.playArmAction('place');
  return true;
}

function tryPlaceBlockAt(screenX, screenY, isRepeat = false) {
  const { worldX, worldY } = getMouseTileFromRaw(screenX, screenY);
  let { tileX, tileY } = getMouseTileFromRaw(screenX, screenY);
  const clickedId = world.getBlockId(tileX, tileY);
  const hotSlot = inventory.getSlot(selectedIndex);
  if (!hotSlot || hotSlot.type !== 'block' || !world.inBounds(tileX, tileY)) return;

  if (clickedId !== 'air' && !NATURE_BLOCKS.has(clickedId)) return;

  if (rectsOverlap(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE, player.x, player.y, player.width, player.height) && !backgroundBuild && hotSlot.blockId !== 'ladder') return;

  const placed = placer.place(world, { type: 'block', blockId: hotSlot.blockId }, tileX, tileY, {
    mouseWorldX: worldX,
    mouseWorldY: worldY,
    modifierFlip: input.isKeyDown(keybinds.flip),
    rotate: input.isKeyDown(keybinds.rotate),
    background: backgroundBuild
  });
  if (placed) player.playArmAction('place');
  if (placed && !creativeMode) {
    hotSlot.count -= 1;
    if (hotSlot.count <= 0) inventory.setSlot(selectedIndex, null);
  }
}

function updateHeldPlacement(uiOpen) {
  if (!input.mouse.rightDown || uiOpen) {
    placeHeld = false;
    return;
  }
  if (!placeHeld) return;
  const now = performance.now();
  if (now - lastPlaceTime < PLACE_REPEAT_MS) return;
  lastPlaceTime = now;
  tryPlaceBlockAt(input.mouse.x, input.mouse.y, true);
}

canvas.addEventListener('wheel', (e) => {
  if (!world || inventoryOpen || openContainer) return;
  selectedIndex = e.deltaY > 0 ? (selectedIndex + 1) % 9 : (selectedIndex + 8) % 9;
  e.preventDefault();
}, { passive: false });

function setChatValue(value) {
  textInputValue = value;
  const chatInput = document.getElementById('chatInput');
  if (chatInput) chatInput.value = value;
}

function closeChat() {
  textInputMode = false;
  textInputValue = '';
  commandSuggestions = [];
  selectedSuggestionIndex = -1;
  itemSuggestions = [];
  selectedItemIndex = -1;
  if (player) player.inputLocked = false;
  const chat = document.getElementById('chat');
  if (chat) chat.classList.add('hidden');
  const suggestions = document.getElementById('chatSuggestions');
  if (suggestions) suggestions.classList.add('hidden');
  const chatInput = document.getElementById('chatInput');
  if (chatInput) chatInput.blur();
}

function openChat(initialValue) {
  textInputMode = true;
  if (player) player.inputLocked = true;
  const chat = document.getElementById('chat');
  if (chat) chat.classList.remove('hidden');
  setChatValue(initialValue);
  updateCommandSuggestions();
  const chatInput = document.getElementById('chatInput');
  if (chatInput) chatInput.focus();
}

function applySuggestion(element) {
  const strong = element.querySelector('strong');
  const label = strong ? strong.textContent : '';
  if (label.startsWith('/')) {
    setChatValue(`${label} `);
  } else {
    const itemId = element.dataset.id;
    if (!itemId) return;
    const parts = textInputValue.slice(1).split(' ');
    parts[Math.max(1, parts.length - 1)] = itemId;
    setChatValue('/' + parts.join(' ') + ' ');
  }
  updateCommandSuggestions();
}

function handleChatKey(e) {
  const dropdown = document.getElementById('chatSuggestions');
  const suggestionItems = dropdown && !dropdown.classList.contains('hidden')
    ? Array.from(dropdown.querySelectorAll('.suggestion-item'))
    : [];
  const currentIndex = suggestionItems.findIndex(item => item.classList.contains('selected'));

  if (e.code === 'Escape') {
    closeChat();
    e.preventDefault();
    return;
  }

  if (e.code === 'Enter') {
    const command = textInputValue;
    if (command.trim()) {
      chatHistory.push(command);
      if (chatHistory.length > 20) chatHistory.shift();
    }
    chatHistoryIndex = -1;
    closeChat();
    processTextInputCommand(command);
    e.preventDefault();
    return;
  }

  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    const up = e.code === 'ArrowUp';
    if (suggestionItems.length > 0) {
      suggestionItems.forEach(item => item.classList.remove('selected'));
      const len = suggestionItems.length;
      const next = up ? (currentIndex <= 0 ? len - 1 : currentIndex - 1) : (currentIndex + 1) % len;
      suggestionItems[next].classList.add('selected');
    } else if (up && chatHistoryIndex < chatHistory.length - 1) {
      chatHistoryIndex++;
      setChatValue(chatHistory[chatHistory.length - 1 - chatHistoryIndex]);
    } else if (!up && chatHistoryIndex > 0) {
      chatHistoryIndex--;
      setChatValue(chatHistory[chatHistory.length - 1 - chatHistoryIndex]);
    } else if (!up && chatHistoryIndex === 0) {
      chatHistoryIndex = -1;
      setChatValue('');
    }
    e.preventDefault();
    return;
  }

  if (e.code === 'Tab') {
    if (suggestionItems.length > 0) {
      applySuggestion(suggestionItems[currentIndex >= 0 ? currentIndex : 0]);
    }
    e.preventDefault();
  }
}

const chatInputElement = document.getElementById('chatInput');
if (chatInputElement) {
  chatInputElement.addEventListener('input', (e) => {
    if (!textInputMode) return;
    textInputValue = e.target.value;
    updateCommandSuggestions();
  });
}

window.addEventListener('keydown', (e) => {
  if (rebindingKey) return;
  if (textInputMode) {
    handleChatKey(e);
    return;
  }
  if (!world || !player || isLoading || isEditableTarget(e.target)) return;

  const uiOpen = inventoryOpen || !!openContainer;

  if (e.code === keybinds.pause) {
    if (uiOpen) closeInventory();
    else if (gamePaused) menuManager.resumeGame();
    else menuManager.showPauseMenu();
    e.preventDefault();
    return;
  }

  if (gamePaused) return;

  if (e.code === keybinds.inventory) {
    if (uiOpen) {
      closeInventory();
    } else {
      inventoryOpen = true;
      recomputeCraft();
    }
    return;
  }

  if (e.code.startsWith('Digit')) {
    const idx = parseInt(e.code.slice(5), 10) - 1;
    if (idx >= 0 && idx < 9) selectedIndex = idx;
    return;
  }

  if (uiOpen) return;

  if (e.code === keybinds.chat || e.code === 'Slash') {
    openChat(e.code === 'Slash' ? '/' : '');
    e.preventDefault();
    return;
  }
  if (e.code === keybinds.background) backgroundBuild = !backgroundBuild;
  if (e.code === 'BracketLeft') setRenderDistance(CHUNK_RENDER_DISTANCE - 1);
  if (e.code === 'BracketRight') setRenderDistance(CHUNK_RENDER_DISTANCE + 1);
  if (e.code === 'KeyP') showOutline = !showOutline;
  if (e.code === keybinds.drop && !isDropKeyHeld) {
    isDropKeyHeld = true;
    lastDropTime = 0;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === keybinds.drop) isDropKeyHeld = false;
});

function setRenderDistance(distance) {
  CHUNK_RENDER_DISTANCE = Math.max(1, Math.min(32, distance));
  if (world) {
    world.maxLoadedChunks = Math.max(30, (CHUNK_RENDER_DISTANCE + 2) * 2 + 1);
    lastPreloadChunk = null;
  }
}

function updateSlot(slot, stack, isSelected) {
  const id = stackId(stack);
  if (id) {
    let img = slot.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.draggable = false;
      img.onerror = () => { img.onerror = null; img.src = 'textures/stone.png'; };
      slot.appendChild(img);
    }
    const src = window.renderer?.biomeIconSrc?.(id) || `textures/${id}.png`;
    if (img.dataset.src !== src) {
      img.dataset.src = src;
      img.src = src;
    }
    let countSpan = slot.querySelector('.item-count');
    if (stack.count > 1) {
      if (!countSpan) {
        countSpan = document.createElement('span');
        countSpan.className = 'item-count';
        slot.appendChild(countSpan);
      }
      countSpan.textContent = stack.count;
    } else if (countSpan) {
      countSpan.remove();
    }
    slot.classList.add('has-item');
    slot.title = stack.displayName || id;
    // Heated metal shows how much heat it has left.
    let heat = slot.querySelector('.heat-bar');
    if (stack.heatedAt && id.endsWith('_heated')) {
      if (!heat) {
        heat = document.createElement('div');
        heat.className = 'heat-bar';
        heat.appendChild(document.createElement('div'));
        slot.appendChild(heat);
      }
      heat.firstChild.style.width = `${Math.max(0, 100 - (Date.now() - stack.heatedAt) / HEAT_COOL_MS * 100)}%`;
    } else if (heat) heat.remove();
  } else if (slot.firstChild) {
    slot.innerHTML = '';
    slot.classList.remove('has-item');
    slot.title = '';
  }
  slot.classList.toggle('selected', !!isSelected);
}

function updateOverlaySlots(overlay) {
  for (const slotEl of overlay.querySelectorAll('.inventory-slot:not(.container-slot):not(.creative-slot), .hotbar-slot')) {
    const idx = Number(slotEl.dataset.index);
    updateSlot(slotEl, inventory.getSlot(idx), idx === selectedIndex && slotEl.classList.contains('hotbar-slot'));
  }
  const grid = getActiveCraftGrid();
  for (const slotEl of overlay.querySelectorAll('.crafting-slot')) {
    updateSlot(slotEl, grid[Number(slotEl.dataset.index)], false);
  }
  const outSlot = overlay.querySelector('.crafting-output-slot');
  if (outSlot) updateSlot(outSlot, craftOutput, false);
}

let creativeCategoriesCache = null;
function getCreativeCategoriesCached() {
  if (!creativeCategoriesCache) creativeCategoriesCache = inventory.getCreativeCategories();
  return creativeCategoriesCache;
}

const CREATIVE_SEARCH_TAB = 'search';
const CREATIVE_INVENTORY_TAB = 'inventory';
let creativeSearchQuery = '';

function getCreativeTabItems(tabId) {
  const categories = getCreativeCategoriesCached();
  if (tabId === CREATIVE_SEARCH_TAB) {
    const all = Object.values(categories).flatMap(category => category.items);
    if (!creativeSearchQuery) return all;
    return all.filter(item => `${item.displayName || ''} ${stackId(item)}`.toLowerCase().includes(creativeSearchQuery));
  }
  return categories[tabId]?.items || [];
}

function createCreativeTab(tabId, name, iconId) {
  const tab = document.createElement('button');
  tab.className = 'creative-tab';
  tab.dataset.tab = tabId;
  tab.title = name;
  const img = document.createElement('img');
  img.draggable = false;
  img.src = `textures/${iconId}.png`;
  img.onerror = () => { img.onerror = null; img.src = 'textures/stone.png'; };
  tab.appendChild(img);
  return tab;
}

let renderedCreativeTab = null;
let renderedCreativeQuery = null;
function updateCreativePanel() {
  const overlay = document.getElementById('inventory');
  const panel = document.getElementById('creativePanel');
  if (!panel || !overlay) return;
  overlay.classList.toggle('creative-mode', creativeMode);
  panel.classList.toggle('hidden', !creativeMode || creativeTab === CREATIVE_INVENTORY_TAB);
  if (!creativeMode) return;

  const categories = getCreativeCategoriesCached();
  const virtualTabs = [CREATIVE_SEARCH_TAB, CREATIVE_INVENTORY_TAB];
  if (!categories[creativeTab] && !virtualTabs.includes(creativeTab)) creativeTab = Object.keys(categories)[0];
  overlay.dataset.creativeTab = creativeTab;

  const tabs = document.getElementById('creativeTabs');
  const bottomTabs = document.getElementById('creativeTabsBottom');
  if (tabs && !tabs.childElementCount) {
    for (const [tabId, category] of Object.entries(categories)) {
      tabs.appendChild(createCreativeTab(tabId, category.name, stackId(category.items[0]) || 'stone'));
    }
    const search = createCreativeTab(CREATIVE_SEARCH_TAB, 'Search Items', 'stick');
    search.classList.add('creative-tab-search');
    tabs.appendChild(search);
  }
  if (bottomTabs && !bottomTabs.childElementCount) {
    const survival = createCreativeTab(CREATIVE_INVENTORY_TAB, 'Survival Inventory', 'oak_chest');
    survival.classList.add('creative-tab-inventory');
    bottomTabs.appendChild(survival);
  }
  for (const tab of document.querySelectorAll('#inventory .creative-tab')) {
    tab.classList.toggle('selected', tab.dataset.tab === creativeTab);
  }

  const title = document.getElementById('creativeTitle');
  if (title) {
    title.textContent = creativeTab === CREATIVE_SEARCH_TAB ? 'Search Items' : (categories[creativeTab]?.name || '');
  }

  const grid = document.getElementById('creativeGrid');
  if (grid && (renderedCreativeTab !== creativeTab || renderedCreativeQuery !== creativeSearchQuery)) {
    if (renderedCreativeTab !== creativeTab) grid.scrollTop = 0;
    renderedCreativeTab = creativeTab;
    renderedCreativeQuery = creativeSearchQuery;
    grid.innerHTML = '';
    const items = getCreativeTabItems(creativeTab);
    const slotCount = Math.max(45, Math.ceil(items.length / 9) * 9);
    for (let index = 0; index < slotCount; index++) {
      const slot = document.createElement('div');
      slot.className = 'inventory-slot creative-slot';
      slot.dataset.index = index;
      if (items[index]) updateSlot(slot, items[index], false);
      grid.appendChild(slot);
    }
  }
}

function shiftClickCreative(index) {
  if (!creativeMode) return;
  const item = getCreativeTabItems(creativeTab)[index];
  if (!item) return;
  addStackToInventory({ ...item, count: item.maxStack ?? 64 });
}

function bindCreativeSearch() {
  const input = document.getElementById('creativeSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    creativeSearchQuery = input.value.trim().toLowerCase();
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.code === 'Escape' || e.code === 'Enter') input.blur();
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
}
bindCreativeSearch();

// The furnace window: a copy of the chest window with the chest grid swapped for an
// input slot over a flame (fuel burning) and a fuel slot, an arrow (cooking progress) and
// the output slot.
function ensureFurnaceUI() {
  if (document.getElementById('furnaceUI')) return;
  const chest = document.getElementById('chestUI');
  if (!chest) return;
  const ui = chest.cloneNode(true);
  ui.id = 'furnaceUI';
  ui.classList.add('hidden');
  ui.querySelector('#chestTitle').id = 'furnaceTitle';
  ui.querySelector('#furnaceTitle').textContent = 'Furnace';
  const grid = ui.querySelector('#chestGrid');
  const area = document.createElement('div');
  area.className = 'furnace-area';
  area.innerHTML = `
    <div class="furnace-left">
      <div class="inventory-slot container-slot" data-index="0" title="Smelt"></div>
      <div class="furnace-flame"><div class="furnace-flame-fill"></div></div>
      <div class="inventory-slot container-slot" data-index="1" title="Fuel"></div>
    </div>
    <div class="furnace-arrow"><div class="furnace-arrow-fill"></div></div>
    <div class="inventory-slot container-slot furnace-output" data-index="2" title="Output"></div>`;
  grid.replaceWith(area);
  chest.after(ui);
}

// The forging table window, laid out like a cartography table: hammer over ingot on the
// left, an arrow, a big panel listing the heads that ingot can become, and the output.
function ensureForgeUI() {
  if (document.getElementById('forgeUI')) return;
  const chest = document.getElementById('chestUI');
  if (!chest) return;
  const ui = chest.cloneNode(true);
  ui.id = 'forgeUI';
  ui.classList.add('hidden');
  ui.querySelector('#chestTitle').id = 'forgeTitle';
  ui.querySelector('#forgeTitle').textContent = 'Forging Table';
  const area = document.createElement('div');
  area.className = 'forge-area';
  area.innerHTML = `
    <div class="forge-inputs">
      <div class="inventory-slot container-slot" data-index="0" title="Blacksmith Hammer"></div>
      <div class="forge-plus">+</div>
      <div class="inventory-slot container-slot" data-index="1" title="Heated Ingot"></div>
    </div>
    <div class="forge-arrow"></div>
    <div class="forge-panel"><div class="forge-hint"></div><div class="forge-choices"></div></div>
    <div class="inventory-slot container-slot forge-output" data-index="2" title="Output"></div>`;
  ui.querySelector('#chestGrid').replaceWith(area);
  const choices = area.querySelector('.forge-choices');
  for (const type of HEAD_TYPES) {
    const el = document.createElement('div');
    el.className = 'forge-choice';
    el.dataset.type = type;
    choices.appendChild(el);
  }
  choices.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.forge-choice');
    if (!el || el.classList.contains('disabled') || openContainer?.kind !== 'forge') return;
    e.stopPropagation();
    openContainer.choice = openContainer.choice === el.dataset.type ? null : el.dataset.type;
  });
  chest.after(ui);
}

function updateForgeUI(overlay) {
  const [hammer, ingot] = openContainer.slots;
  for (const slotEl of overlay.querySelectorAll('.container-slot')) {
    const i = Number(slotEl.dataset.index);
    updateSlot(slotEl, i === 2 ? forgeOutput() : openContainer.slots[i], false);
  }
  const material = heatedIngotMaterial(stackId(ingot));
  const hasHammer = stackId(hammer) === 'blacksmith_hammer';
  const hint = overlay.querySelector('.forge-hint');
  hint.textContent = !hasHammer && !material ? 'Add a blacksmith hammer and a heated ingot'
    : !hasHammer ? 'Add a blacksmith hammer'
    : !material ? 'Add a heated ingot'
    : openContainer.choice ? '' : 'Pick a head to forge';
  for (const el of overlay.querySelectorAll('.forge-choice')) {
    const id = `${material || 'copper'}_${el.dataset.type}_head`;
    const ok = !!material && hasHammer && !!registry.get(`${id}_heated`);
    el.classList.toggle('disabled', !ok);
    el.classList.toggle('selected', ok && openContainer.choice === el.dataset.type);
    updateSlot(el, registry.get(id) ? inventory.createStack('item', id, 1) : null, false);
    el.title = registry.get(id)?.displayName || el.dataset.type;
  }
}

function buildContainerSlots(capacity) {
  const grid = document.getElementById('chestGrid');
  if (!grid || grid.childElementCount === capacity) return;
  grid.innerHTML = '';
  for (let i = 0; i < capacity; i++) {
    const slot = document.createElement('div');
    slot.className = 'inventory-slot container-slot';
    slot.dataset.index = i;
    grid.appendChild(slot);
  }
}

let htmlUIFrameCounter = 0;
function updateHTMLUI() {
  htmlUIFrameCounter++;
  if (htmlUIFrameCounter % 3 !== 0) return;

  const inGame = !!(world && player && inventory) && !isAnyMenuVisible();
  const isCraftingTable = openContainer?.title === 'Crafting Table';
  const isFurnace = openContainer?.kind === 'furnace';
  const isForge = openContainer?.kind === 'forge';
  const isChest = !!openContainer && !isCraftingTable && !isFurnace && !isForge;
  ensureFurnaceUI();
  ensureForgeUI();
  if (htmlUIFrameCounter % 15 === 0 && inGame) coolHeatedStacks();

  const hotbar = document.getElementById('hotbar');
  if (hotbar) {
    hotbar.classList.toggle('hidden', !inGame || inventoryOpen || !!openContainer);
    if (inGame) {
      for (const slotEl of hotbar.querySelectorAll('.hotbar-slot')) {
        const idx = Number(slotEl.dataset.index);
        updateSlot(slotEl, inventory.getSlot(idx), idx === selectedIndex);
      }
    }
  }

  const overlays = {
    inventory: inGame && inventoryOpen && !openContainer,
    craftingTable: inGame && isCraftingTable,
    chestUI: inGame && isChest,
    furnaceUI: inGame && isFurnace,
    forgeUI: inGame && isForge
  };
  for (const [id, visible] of Object.entries(overlays)) {
    const overlay = document.getElementById(id);
    if (!overlay) continue;
    overlay.classList.toggle('hidden', !visible);
    if (!visible) continue;
    if (id === 'inventory') updateCreativePanel();
    if (id === 'furnaceUI') {
      for (const slotEl of overlay.querySelectorAll('.container-slot')) {
        updateSlot(slotEl, openContainer.slots[Number(slotEl.dataset.index)], false);
      }
      const m = openContainer.meta;
      const recipe = SMELTING[stackId(openContainer.slots[0])];
      const flame = m.burnMax > 0 ? m.burn / m.burnMax : 0;
      const cook = recipe ? Math.min(1, m.cook / recipe[1]) : 0;
      overlay.querySelector('.furnace-flame-fill').style.height = `${Math.round(flame * 100)}%`;
      overlay.querySelector('.furnace-arrow-fill').style.width = `${Math.round(cook * 100)}%`;
    }
    if (id === 'forgeUI') updateForgeUI(overlay);
    if (id === 'chestUI') {
      const title = document.getElementById('chestTitle');
      if (title) title.textContent = openContainer.title;
      buildContainerSlots(openContainer.capacity);
      for (const slotEl of overlay.querySelectorAll('.container-slot')) {
        updateSlot(slotEl, openContainer.slots[Number(slotEl.dataset.index)], false);
      }
    }
    updateOverlaySlots(overlay);
  }

  const draggingDiv = document.getElementById('dragging-item');
  if (draggingDiv) {
    const showDrag = !!draggingStack && (inventoryOpen || !!openContainer);
    draggingDiv.classList.toggle('hidden', !showDrag);
    if (showDrag) updateSlot(draggingDiv, draggingStack, false);
  }

  const fpsCounter = document.getElementById('fpsCounter');
  if (fpsCounter && window.renderer) fpsCounter.textContent = `FPS: ${window.renderer.fps}`;

  const coordinates = document.getElementById('coordinates');
  if (coordinates) coordinates.classList.toggle('hidden', !inGame);
  const coordText = document.getElementById('coordText');
  if (coordText && inGame) {
    const px = Math.floor((player.x + player.width / 2) / TILE_SIZE);
    const py = Math.floor((player.y + player.height / 2) / TILE_SIZE);
    coordText.textContent = `X: ${px} Y: ${py}`;
  }

  const showStats = inGame && !creativeMode;
  const healthDisplay = document.getElementById('healthDisplay');
  if (healthDisplay) healthDisplay.classList.toggle('hidden', !showStats);
  const hungerDisplay = document.getElementById('hungerDisplay');
  if (hungerDisplay) hungerDisplay.classList.toggle('hidden', !showStats);
  if (showStats) {
    renderStatIcons(healthDisplay, 'heart', player.health, player.maxHealth);
    renderStatIcons(hungerDisplay, 'hunger', player.hunger, player.maxHunger);
  }
}

function renderStatIcons(container, kind, value, max) {
  if (!container) return;
  const key = `${Math.ceil(value)}/${max}`;
  if (container.dataset.state === key) return;
  container.dataset.state = key;
  const icons = Math.ceil(max / 2);
  const points = Math.ceil(value);
  container.textContent = '';
  for (let i = 0; i < icons; i++) {
    const remaining = points - i * 2;
    const fill = remaining >= 2 ? 'full' : remaining === 1 ? 'half' : 'empty';
    const icon = document.createElement('span');
    icon.className = `stat-icon ${kind} ${fill}`;
    container.appendChild(icon);
  }
}

const NATURE_BLOCKS = new Set(['short_grass', 'poppy', 'fern', 'flower_short_grass', 'bush', 'grass_tuft', 'rock', 'pebble']);
let lastPreloadChunk = null;
let lastPreloadTime = 0;
let leafScanCounter = 0;

function preloadChunksAroundPlayer() {
  const now = Date.now();
  if (now - lastPreloadTime < 150) return;
  lastPreloadTime = now;

  const centerChunk = Math.floor((player.x + player.width / 2) / TILE_SIZE / world.chunkSize);
  if (lastPreloadChunk === centerChunk) return;
  lastPreloadChunk = centerChunk;

  const lastChunk = Math.floor((world.width - 1) / world.chunkSize);
  const dist = Math.max(0, Math.floor(CHUNK_RENDER_DISTANCE));
  const keepMin = Math.max(0, centerChunk - dist - 1);
  const keepMax = Math.min(lastChunk, centerChunk + dist + 1);

  for (const key of Array.from(world.chunks.keys())) {
    const cx = parseInt(key, 10);
    if (cx < keepMin || cx > keepMax) world.unloadChunk(cx);
  }

  const chunksToLoad = [];
  for (let cx = keepMin; cx <= keepMax; cx++) {
    if (!world.isChunkLoaded(cx)) chunksToLoad.push(cx);
  }
  chunksToLoad.sort((a, b) => Math.abs(a - centerChunk) - Math.abs(b - centerChunk));
  const targetWorld = world;
  for (const cx of chunksToLoad) {
    world.loadChunkAsync(cx).then(() => {
      if (world === targetWorld) restoreSavedEntities(cx);
    }).catch(() => { });
  }
}

function explosionContext() {
  return {
    player,
    tileSize: TILE_SIZE,
    fx: explosionFX,
    destroyItems: destroyItemsInRadius,
    onBlockBroken: spawnExplosionDrop,
    prime: (x, y, fuse) => primedExplosives.push(new PrimedExplosive(x, y, TILE_SIZE, fuse))
  };
}

function destroyItemsInRadius(cx, cy, inner, outer) {
  const in2 = inner * inner;
  const out2 = outer * outer;
  for (let i = items.length - 1; i >= 0; i--) {
    const dx = items[i].x - cx;
    const dy = items[i].y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= in2 && d2 <= out2) items.splice(i, 1);
  }
}

function spawnExplosionDrop(dropId, meta, id, x, y, dx, dy) {
  const centerX = (x + 0.5) * TILE_SIZE;
  const centerY = (y + 0.5) * TILE_SIZE;
  const len = Math.hypot(dx, dy) || 1;
  const push = () => (Math.random() * 1.5 + 1);
  spawnItemEntity(dropId, centerX, centerY, 1, (dx / len) * push(), (dy / len) * push() - 1.5);
  if ((isChest(id) || id === 'furnace' || id === 'forging_table') && Array.isArray(meta?.inv)) {
    for (const stack of meta.inv) {
      if (!stack || stack.count <= 0) continue;
      spawnItemEntity(stackId(stack), centerX, centerY, stack.count, (Math.random() - 0.5) * 3, -1.5);
    }
  }
  if (openContainer && openContainer.tileX === x && openContainer.tileY === y) closeInventory();
}

function handleBrokenBlock(broke) {
  const centerX = broke.x * TILE_SIZE + TILE_SIZE / 2;
  const centerY = (broke.y + 0.5) * TILE_SIZE;
  spawnItemEntity(broke.drop, centerX, centerY);

  if ((isChest(broke.id) || broke.id === 'furnace' || broke.id === 'forging_table') && Array.isArray(broke.meta?.inv)) {
    for (const stack of broke.meta.inv) {
      if (!stack || stack.count <= 0) continue;
      spawnItemEntity(stackId(stack), centerX + (Math.random() - 0.5) * TILE_SIZE * 0.6, centerY, stack.count, (Math.random() - 0.5) * 2, -1);
    }
  }

  for (const drop of broke.extraDrops) {
    spawnItemEntity(drop.id, drop.x * TILE_SIZE + TILE_SIZE / 2, (drop.y + 0.5) * TILE_SIZE);
  }

  if (openContainer && openContainer.tileX === broke.x && openContainer.tileY === broke.y) {
    closeInventory();
  }
}

function tryPickupItem(item) {
  const itemCenterX = item.x + item.width / 2;
  const itemCenterY = item.y + item.height / 2;
  const playerCenterX = player.x + player.width / 2;
  const dx = playerCenterX - itemCenterX;
  const distance = Math.min(
    Math.hypot(dx, player.y + player.height / 2 - itemCenterY),
    Math.hypot(dx, player.y + player.height * 0.3 - itemCenterY),
    Math.hypot(dx, player.y + player.height - itemCenterY)
  );
  if (distance >= ItemEntity.getConfig().pickupRange) return false;

  const id = item.blockId || item.itemId;
  const total = item.count || 1;
  const leftover = registry.isItem(id) ? inventory.addItem(id, total) : inventory.addBlock(id, total);
  if (leftover >= total) return false;
  item.count = leftover;
  return leftover <= 0;
}

function updateEntities() {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const expired = item.update(world.time, world, player);
    if (expired || (item.readyForPickup && !inventoryOpen && !openContainer && tryPickupItem(item))) {
      items.splice(i, 1);
    }
  }

  for (let i = leafParticles.length - 1; i >= 0; i--) {
    if (leafParticles[i].update(world.time, world)) leafParticles.splice(i, 1);
  }
  explosionFX.update(world, TILE_SIZE);
  for (let i = primedExplosives.length - 1; i >= 0; i--) {
    const primed = primedExplosives[i];
    if (!primed.update(world)) continue;
    primedExplosives.splice(i, 1);
    const tile = primed.tile();
    registry.get('explosive').explode(world, tile.x, tile.y, explosionContext());
  }

  const playerCenterX = player.x + player.width / 2;
  leafScanCounter++;
  // Leafy biomes (e.g. the autumn Birch Grove) drop more leaves and allow more on screen.
  const leafFall = leafFallAt(Math.floor(playerCenterX / TILE_SIZE), world.seed ?? 0);
  const maxLeaves = Math.round(24 * Math.min(3, leafFall));
  if (renderFallingLeaves && leafScanCounter % 10 === 0 && leafParticles.length < maxLeaves) {
    const playerTileX = Math.floor(playerCenterX / TILE_SIZE);
    const playerTileY = Math.floor((player.y + player.height / 2) / TILE_SIZE);
    const radius = 6;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tileX = playerTileX + dx;
        const tileY = playerTileY + dy;
        if (!world.inBounds(tileX, tileY) || !world.isChunkLoaded(world.chunkXFor(tileX))) continue;
        const blockId = world.getBlockId(tileX, tileY);
        if (!blockId.endsWith('_leaves')) continue;
        const distanceFactor = Math.max(0, 1 - Math.hypot(dx, dy) / radius);
        if (Math.random() < 0.002 * leafFall * (1 + distanceFactor) && leafParticles.length < maxLeaves) {
          const particleX = (tileX + 0.5) * TILE_SIZE + (Math.random() - 0.5) * TILE_SIZE * 0.4;
          const particleY = (tileY + 0.1) * TILE_SIZE;
          leafParticles.push(new LeafParticle(blockId, particleX, particleY, world.time, 0.6 + Math.random() * 0.5));
        }
      }
    }
  }
}

function initializeGameEngine() {
  const updateFunction = (dt, time) => {
    if (!world || !player) return;
    if (gamePaused) {
      updateHTMLUI();
      return;
    }

    if (!world.timeManuallySet) world.time += dt * gameSpeed;

    player.inputLocked = textInputMode;
    player.autoJump = autoJump;
    player.update(input, dt, time, noClipMode, creativeMode);

    if (isDropKeyHeld && !inventoryOpen && !openContainer) {
      const now = time * 1000;
      if (now - lastDropTime >= dropInterval) {
        throwSelectedBlock();
        lastDropTime = now;
      }
    }

    const uiOpen = inventoryOpen || !!openContainer || textInputMode;
    const mouseActive = (input.mouse.leftDown || input.mouse.rightDown) && !uiOpen;
    updateHeldPlacement(uiOpen);
    if (mouseActive) {
      if (!player.swingAnimation.active || !player.swingAnimation.continuous) {
        player.startContinuousSwing(world.time);
      }
    } else if (player.swingAnimation.continuous) {
      player.stopSwing();
    }

    if (input.mouse.leftDown && !uiOpen) {
      const tileX = Math.floor(camera.screenToWorldX(input.mouse.x) / TILE_SIZE);
      const tileY = Math.floor(camera.screenToWorldY(input.mouse.y) / TILE_SIZE);
      if (world.inBounds(tileX, tileY)) {
        breaker.begin(world, tileX, tileY, creativeMode, inventory.getSlot(selectedIndex));
      } else {
        breaker.cancel();
      }
    } else {
      breaker.cancel();
    }

    const broke = breaker.update(world, dt * gameSpeed);
    if (broke && broke.id) handleBrokenBlock(broke);

    updateEntities();

    if (openContainer) {
      const blockId = world.getBlockId(openContainer.tileX, openContainer.tileY);
      if (!isChest(blockId) && blockId !== 'crafting_table' && blockId !== 'furnace' && blockId !== 'forging_table') closeInventory();
      // Keep an open furnace's progress bars moving smoothly.
      else if (openContainer.kind === 'furnace') registry.get('furnace').tick(world, openContainer.tileX, openContainer.tileY, openContainer.meta);
    }

    world.tick(dt * gameSpeed);
    preloadChunksAroundPlayer();

    const head = player.getHeadAnchor();
    camera.followTo(head.x, head.y, canvas, world);

    updateHTMLUI();
  };

  const renderFunction = () => {
    if (window.renderer) window.renderer.render();
  };

  if (engine) engine.stop();
  engine = new Engine(updateFunction, renderFunction);
  window.engine = engine;
}

window.addEventListener('beforeunload', () => {
  const state = getSaveState();
  if (state) saveManager.saveSync(state.world, state.player, state.items, state.inventory, state.meta);
  saveManager.stopAutoSave();
});
