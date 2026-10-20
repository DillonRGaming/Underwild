// The game's shared state: the current world, player, open screens and so on, as one object
// every module reads and changes (game.world, game.player...), plus the long-lived services.
import { ExplosionFX } from '../entities/explosion_fx.js';
import { SaveManager } from '../core/saveManager.js';
import { Preferences } from '../core/preferences.js';

export const game = {
  // Set up at start-up (src/script.js).
  menuManager: null,
  tempKeybinds: null,
  currentSeed: 0,
  currentTheme: 'minimal',
  chunkRenderDistance: 6, // chunks each side (Options > Graphics > Render Distance)
  worldName: 'New World',
  worldSeed: '',
  worldGameMode: 'survival',
  worldCheatsEnabled: false,
  worldAllowCommands: false,
  worldDifficulty: 'easy',
  worldType: 'regular',
  worldSize: 'normal',
  worldStartingTime: 'day',
  startingHealth: 10,
  startingHunger: 10,
  renderDistance: 'normal',
  textureQuality: 'fancy',
  autoJump: true,
  renderFallingLeaves: true,
  masterVolume: 100,
  musicVolume: 50,
  sfxVolume: 75,
  backgroundMusic: null,
  isMusicPlaying: false,
  musicFadeFrame: null,
  musicLoopTimeout: null,
  currentTrackId: 'underwild-mystic',
  backgroundBlocks: ['sand', 'smooth_sandstone'],
  world: null,
  dimensionManager: null,
  items: [],
  lastPlaceTime: 0,
  placeHeld: false,
  gameSpeed: 1,
  setPosition1: null,
  setPosition2: null,
  isLoading: false,
  creativeMode: false,
  currentWorldSaveName: null,
  player: null,
  inventory: null,
  camera: null,
  input: null,
  canvas: null,
  ctx: null,
  modManager: null,
  engine: null,
  renderer: null,
  breaker: null,
  placer: null,
  inventoryCraftGrid: null,
  craftGrid: null,
  craftOutput: null,
  craftMatch: null,
  openContainer: null,
  draggingStack: null,
  isDropKeyHeld: false,
  lastDropTime: 0,
  rebindingKey: null,
  // Whether the menu render loop is running (see startMenuLoop in loop.js).
  menuLoopRunning: false,
  chatHistoryIndex: -1,
  commandSuggestions: [],
  itemSuggestions: [],
  spawnTileX: 100,
  // Read again once the saved preferences have loaded (see loadGameSettings).
  creativeSortMode: 'material',
  inventoryOpen: false,
  selectedIndex: 0,
  noClipMode: false,
  creativeTab: 'building',
  textInputMode: false,
  textInputValue: '',
  showOutline: true,
  backgroundBuild: false,
  gamePaused: false,
  lastClickTime: 0,
  lastClickSlot: null,
  dragStartSlot: null,
  dragStartPos: null,
  lastPaintSlot: null,
  // True while a press that started on the background (a wall or a background block) is
  // held: that press only breaks background. A press that started on a block only breaks
  // blocks, so it never eats the wall behind a block you just broke.
  wallPress: false,
  lastHitTime: 0,
  creativeCategoriesCache: null,
  creativeSearchQuery: '',
  renderedCreativeTab: null,
  renderedCreativeQuery: null,
  // The recipe being held down in the crafting list (see craftingUI.js).
  recipeHold: null,
  htmlUIFrameCounter: 0,
  lastPreloadChunk: null,
  lastPreloadTime: 0,
  leafScanCounter: 0,
  itemMergeCounter: 0,
  tickAccum: 0
};

export const leafParticles = [];

export const explosionFX = new ExplosionFX();

export const primedExplosives = [];

// /tp fallen and /tp <biome> targets already visited this session, so repeats go somewhere new.
export const tpVisited = new Map();

export const saveManager = new SaveManager();

export const prefs = new Preferences();
