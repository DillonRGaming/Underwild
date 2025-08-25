import { Engine } from './src/core/engine.js';
import { Input } from './src/core/input.js';
import { Renderer } from './src/core/renderer.js';
import { World } from './src/core/world.js';
import { Camera } from './src/core/camera.js';
import { BlockRegistry } from './src/core/registry.js';
import { Player } from './src/entities/player.js';
import { TILE_SIZE, rectsOverlap } from './src/core/utils.js';
import { registerAllBlocks } from './blocks/index.js';
import { registerAllItems } from './items/index.js';
import { sampleBlockAt } from './src/logic/terrainGen.js';
import { Placer } from './src/logic/placing.js';
import { Breaker } from './src/logic/breaking.js';
import { findMatchingRecipe, consumeRecipeIngredients, createRecipeOutput } from './src/logic/crafting.js';
import { LeafParticle } from './src/entities/leaf_particle.js';
import { ModManager } from './mods/index.js';

import { ItemEntity } from './src/entities/item.js';
import { Bee } from './src/entities/bee.js';

// Game version
const GAME_VERSION = '0.0.1';

// World configuration variables - declared early for MenuManager access
let worldName = 'New World';
let worldSeed = '';
let worldGameMode = 'survival'; // 'survival', 'creative'
let worldCheatsEnabled = false;
let worldAllowCommands = false;
let worldGenerateStructures = true;
let worldDifficulty = 'easy'; // 'peaceful', 'easy', 'normal', 'hard'
let worldType = 'regular'; // 'regular', 'superflat', 'mountains'
let worldSize = 'normal'; // 'small', 'normal', 'large'
let worldStartingTime = 'day'; // 'day', 'night', 'sunset', 'dawn'

let worldSuperflatLayers = [
  { blockId: 'grass', height: 1 },
  { blockId: 'dirt', height: 2 },
  { blockId: 'bedrock', height: 2 }
];

// Options menu state
let renderDistance = 'normal'; // 'tiny', 'short', 'normal', 'far', 'extreme'
let textureQuality = 'fancy'; // 'fast', 'fancy'
let autoJump = true;
let renderFallingLeaves = true;
let masterVolume = 100;
let musicVolume = 50;
let sfxVolume = 75;


// Background configuration
let backgroundBlocks = ['dirt', 'coarse_dirt']; // Default background blocks

// Game state variables - declared early for MenuManager access
let world = null;
let currentSeed = Math.floor(Math.random() * 1000000);
let randomTime = Math.random();
let items = [];
let leafParticles = [];
let bees = [];
let gameSpeed = 1;
let setPosition1 = null; // Store first position for /setpos command
let setPosition2 = null; // Store second position for /setpos2 command
let isLoading = false;
let creativeMode = false;

// Create registry early for MenuManager access
const registry = new BlockRegistry();
registerAllBlocks(registry);
registerAllItems(registry);
window.registry = registry;

// Create player early for MenuManager access
let player = null;

// Create inventory early for MenuManager access
let inventory = null;

// Create camera early for MenuManager access
let camera = null;

// Create input early for MenuManager access
let input = null;

// Create canvas early for MenuManager access
let canvas = null;

// Create ctx early for MenuManager access
let ctx = null;

// Create modManager early for MenuManager access
let modManager = null;

// Create engine and renderer early for MenuManager access
let engine = null;
let renderer = null;

// Create breaker early for MenuManager access
let breaker = null;

// Create placer early for MenuManager access
let placer = null;

// Create inventoryCraftGrid early for MenuManager access
let inventoryCraftGrid = null;

// Create craftGrid early for MenuManager access
let craftGrid = null;

// Create craftOutput early for MenuManager access
let craftOutput = null;

// Create craftMatch early for MenuManager access
let craftMatch = null;

// Create openContainer early for MenuManager access
let openContainer = null;

// Create draggingStack early for MenuManager access
let draggingStack = null;











function saveBackgroundConfig() {
  localStorage.setItem('underwild_background_blocks', JSON.stringify(backgroundBlocks));
  window.backgroundBlocks = backgroundBlocks;
  
  // Force renderer to redraw background if in main menu
  if (window.renderer && window.renderer.mainMenuPatterns) {
    window.renderer.mainMenuPatterns = null;
  }
}

function loadBackgroundConfig() {
  const saved = localStorage.getItem('underwild_background_blocks');
  if (saved) {
    try {
      backgroundBlocks = JSON.parse(saved);
    } catch (e) {
      backgroundBlocks = ['dirt', 'coarse_dirt'];
    }
  }
  
  // Ensure there's always at least one block
  if (backgroundBlocks.length === 0) {
    backgroundBlocks = ['dirt'];
  }
  
  window.backgroundBlocks = backgroundBlocks;
  
  // Update UI if menu manager exists
  if (window.menuManager && window.menuManager.updateBackgroundUI) {
    window.menuManager.updateBackgroundUI();
  }
}

// Keybind settings
let keybinds = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  inventory: 'KeyE',
  chat: 'KeyT',
  drop: 'KeyQ',
  pause: 'Escape',
  background: 'KeyZ',
  rotate: 'KeyR',
  flip: 'KeyF'
};

// Load keybinds from localStorage
function loadKeybinds() {
  const saved = localStorage.getItem('underwild_keybinds');
  if (saved) {
    try {
      const savedKeybinds = JSON.parse(saved);
      // Merge saved keybinds with defaults (in case new keys were added)
      keybinds = { ...keybinds, ...savedKeybinds };
    } catch (e) {
      console.log('Failed to load keybinds, using defaults');
    }
  }
}

// Save keybinds to localStorage
function saveKeybinds() {
  localStorage.setItem('underwild_keybinds', JSON.stringify(keybinds));
}

// Load keybinds on startup
loadKeybinds();

// Temporary keybinds (for editing before applying)
let tempKeybinds = { ...keybinds };

let rebindingKey = null;

// HTML Menu Management System
class MenuManager {
  constructor() {
    this.currentMenu = 'mainMenu';
    this.initializeMenus();
    this.bindEvents();
  }

  initializeMenus() {
    // Hide all menus except main menu
    document.querySelectorAll('.menu-container').forEach(menu => {
      menu.classList.add('hidden');
    });
    document.getElementById('mainMenu').classList.remove('hidden');
    
    // Update version number
    this.updateVersionNumber();
  }

  showMenu(menuId) {
    // Hide current menu
    document.getElementById(this.currentMenu).classList.add('hidden');
    // Show new menu
    document.getElementById(menuId).classList.remove('hidden');
    this.currentMenu = menuId;
  }

  updateVersionNumber() {
    const versionElement = document.querySelector('.version-number');
    if (versionElement) {
      versionElement.textContent = `v${GAME_VERSION}`;
    }
  }

  bindEvents() {
    // Bind all button clicks
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('minecraft-button') || e.target.classList.contains('keybind-button')) {
        const action = e.target.dataset.action;
        this.handleButtonClick(action, e.target);
      }
    });

    // Bind form inputs
    this.bindFormInputs();
    
    // Bind sliders
    this.bindSliders();
  }

  handleButtonClick(action, button) {
    switch (action) {
      case 'single-player':
        this.resetCreateWorldMenu();
        this.showMenu('createWorldMenu');
        break;
      case 'load-world':
        // TODO: Implement load world functionality
        console.log('Load World clicked');
        break;
                    case 'multiplayer':
        this.showMenu('multiplayerMenu');
        this.initializeMultiplayer();
        break;
      case 'mods':
        console.log('Opening mods menu...');
        this.showMenu('modsMenu');
        this.populateModsMenu();
        break;
      case 'options':
        this.showMenu('optionsMenu');
        break;
      case 'quit':
        window.close();
        break;
      case 'changelog':
        this.showMenu('changelogMenu');
        break;
      case 'create-world':
        this.resetCreateWorldMenu();
        this.createWorld();
        break;
      // case 'advanced-options':
      //   // TODO: Implement advanced options
      //   console.log('Advanced Options clicked');
      //   break;
      case 'back-to-main':
        this.showMenu('mainMenu');
        break;
      case 'graphics-options':
        this.showMenu('graphicsOptionsMenu');
        // Initialize background configuration UI
        setTimeout(() => updateBackgroundUI(), 100);
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
        break;
      case 'controls-options':
        this.showMenu('controlsOptionsMenu');
        this.initializeKeybindButtons();
        break;
      case 'back-to-options':
        this.showMenu('optionsMenu');
        break;
      case 'show-advanced-options':
        this.showMenu('advancedOptionsMenu');
        break;
      case 'back-to-create-world':
        this.showMenu('createWorldMenu');
        break;
      
      // Background configuration actions
      case 'add-background-block':
        const newBlockInput = document.getElementById('newBackgroundBlock');
        if (newBlockInput && newBlockInput.value.trim()) {
          addBackgroundBlock(newBlockInput.value.trim());
          newBlockInput.value = '';
        }
        break;

      
      // Game mode buttons
      case 'game-mode-survival':
        this.updateButtonGroup(button, 'game-mode-survival', 'game-mode-creative');
        worldGameMode = 'survival';
        break;
      case 'game-mode-creative':
        this.updateButtonGroup(button, 'game-mode-survival', 'game-mode-creative');
        worldGameMode = 'creative';
        break;
      
      // World type buttons
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
      
      // Render distance buttons
      case 'render-tiny':
        this.updateButtonGroup(button, 'render-tiny', 'render-short', 'render-normal', 'render-far', 'render-extreme');
        renderDistance = 'tiny';
        console.log('Render distance set to:', renderDistance);
        break;
      case 'render-short':
        this.updateButtonGroup(button, 'render-tiny', 'render-short', 'render-normal', 'render-far', 'render-extreme');
        renderDistance = 'short';
        console.log('Render distance set to:', renderDistance);
        break;
      case 'render-normal':
        this.updateButtonGroup(button, 'render-tiny', 'render-short', 'render-normal', 'render-far', 'render-extreme');
        renderDistance = 'normal';
        console.log('Render distance set to:', renderDistance);
        break;
      case 'render-far':
        this.updateButtonGroup(button, 'render-tiny', 'render-short', 'render-normal', 'render-far', 'render-extreme');
        renderDistance = 'far';
        console.log('Render distance set to:', renderDistance);
        break;
      case 'render-extreme':
        this.updateButtonGroup(button, 'render-tiny', 'render-short', 'render-normal', 'render-far', 'render-extreme');
        renderDistance = 'extreme';
        console.log('Render distance set to:', renderDistance);
        break;
      
      // Texture quality buttons
      case 'texture-fast':
        this.updateButtonGroup(button, 'texture-fast', 'texture-fancy');
        textureQuality = 'fast';
        console.log('Texture quality set to:', textureQuality);
        break;
      case 'texture-fancy':
        this.updateButtonGroup(button, 'texture-fast', 'texture-fancy');
        textureQuality = 'fancy';
        console.log('Texture quality set to:', textureQuality);
        break;
      
      // Auto jump buttons
      case 'auto-jump-on':
        this.updateButtonGroup(button, 'auto-jump-on', 'auto-jump-off');
        autoJump = true;
        console.log('Auto jump enabled');
        break;
      case 'auto-jump-off':
        this.updateButtonGroup(button, 'auto-jump-on', 'auto-jump-off');
        autoJump = false;
        console.log('Auto jump disabled');
        break;
        
      // Falling leaves buttons  
      case 'leaves-on':
        this.updateButtonGroup(button, 'leaves-on', 'leaves-off');
        renderFallingLeaves = true;
        console.log('Falling leaves enabled');
        break;
      case 'leaves-off':
        this.updateButtonGroup(button, 'leaves-on', 'leaves-off');
        renderFallingLeaves = false;
        console.log('Falling leaves disabled');
        break;
      
      // Keybind buttons
      case 'bind-forward':
      case 'bind-backward':
      case 'bind-left':
      case 'bind-right':
      case 'bind-jump':
      case 'bind-sprint':
      case 'bind-inventory':
      case 'bind-chat':
      case 'bind-drop':
      case 'bind-pause':
      case 'bind-background':
      case 'bind-rotate':
      case 'bind-flip':
        console.log('Keybind button clicked:', action);
        this.startKeybindRebinding(action.replace('bind-', ''));
        break;
      
      case 'apply-controls':
        this.applyKeybindChanges();
        break;
      case 'reset-controls':
        this.resetKeybindsToDefault();
        break;
      
      // Multiplayer actions
      case 'connection-local':
        this.updateButtonGroup(button, 'connection-local', 'connection-internet');
        break;
      case 'connection-internet':
        this.updateButtonGroup(button, 'connection-local', 'connection-internet');
        break;
      case 'discover-servers':
        this.discoverServers();
        break;
      case 'refresh-servers':
        this.refreshServers();
        break;
      case 'connect-server':
        this.connectToServer();
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
          
        case 'randomize-background':
          this.randomizeBackground();
          break;
          
        case 'create-room':
          this.showMenu('createRoomMenu');
          this.initializeCreateRoom();
          break;
          
        case 'refresh-rooms':
          this.refreshRooms();
          break;
          
        case 'create-multiplayer-world':
          this.createMultiplayerWorld();
          break;
          
        case 'continue-to-room':
          this.continueToRoom();
          break;
          
        case 'host-multiplayer-room':
          this.hostMultiplayerRoom();
          break;
          
        case 'back-to-create-room':
          this.showMenu('createRoomMenu');
          break;
          
        case 'back-to-multiplayer':
          this.showMenu('multiplayerMenu');
          break;
          
        case 'max-players-2':
        case 'max-players-4':
        case 'max-players-8':
          this.updateButtonGroup(button, 'max-players-2', 'max-players-4', 'max-players-8');
          break;
          


      
      // Falling leaves buttons
      case 'leaves-on':
        this.updateButtonGroup(button, 'leaves-on', 'leaves-off');
        renderFallingLeaves = true;
        break;
      case 'leaves-off':
        this.updateButtonGroup(button, 'leaves-on', 'leaves-off');
        renderFallingLeaves = false;
        break;
      
      // World size buttons
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
      
      // Starting time buttons
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
      

      
      // Difficulty buttons
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
      
      // Structure generation buttons
      case 'structures-on':
        this.updateButtonGroup(button, 'structures-on', 'structures-off');
        worldGenerateStructures = true;
        break;
      case 'structures-off':
        this.updateButtonGroup(button, 'structures-on', 'structures-off');
        worldGenerateStructures = false;
        break;
      

      
      // Cheats buttons
      case 'cheats-on':
        this.updateButtonGroup(button, 'cheats-on', 'cheats-off');
        worldCheatsEnabled = true;
        break;
      case 'cheats-off':
        this.updateButtonGroup(button, 'cheats-on', 'cheats-off');
        worldCheatsEnabled = false;
        break;
      
      // Commands buttons
      case 'commands-on':
        this.updateButtonGroup(button, 'commands-on', 'commands-off');
        worldAllowCommands = true;
        break;
      case 'commands-off':
        this.updateButtonGroup(button, 'commands-on', 'commands-off');
        worldAllowCommands = false;
        break;
      
      // Pause menu buttons
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
      case 'enable-mod':
        if (this.currentMod && window.modManager) {
          window.modManager.enableMod(this.currentMod.id);
          this.toggleMod(); // This will update the button state
        }
        break;
      case 'disable-mod':
        if (this.currentMod && window.modManager) {
          window.modManager.disableMod(this.currentMod.id);
          this.toggleMod(); // This will update the button state
        }
        break;
    }
  }

  updateButtonGroup(clickedButton, ...buttonActions) {
    // Remove selected state from all buttons in the group
    buttonActions.forEach(action => {
      const button = document.querySelector(`[data-action="${action}"]`);
      if (button) {
        button.removeAttribute('data-selected');
      }
    });
    // Add selected state to clicked button
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
    // World name input
    const worldNameInput = document.getElementById('worldName');
    if (worldNameInput) {
      worldNameInput.addEventListener('input', (e) => {
        worldName = e.target.value;
      });
    }
    
    // Initialize keybind buttons with current values
    this.initializeKeybindButtons();

    // World seed input
    const worldSeedInput = document.getElementById('worldSeed');
    if (worldSeedInput) {
      worldSeedInput.addEventListener('input', (e) => {
        worldSeed = e.target.value;
      });
    }

    // Checkboxes
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
    
    // Set initial values for world settings
    if (worldNameInput) worldNameInput.value = worldName;
    if (worldSeedInput) worldSeedInput.value = worldSeed;
    if (cheatsCheckbox) cheatsCheckbox.checked = worldCheatsEnabled;
    if (commandsCheckbox) commandsCheckbox.checked = worldAllowCommands;
    if (structuresCheckbox) structuresCheckbox.checked = worldGenerateStructures;
  }

  bindSliders() {
    // Master volume slider
    const masterVolumeSlider = document.getElementById('masterVolume');
    const masterVolumeValue = document.getElementById('masterVolumeValue');
    if (masterVolumeSlider && masterVolumeValue) {
      masterVolumeSlider.addEventListener('input', (e) => {
        masterVolume = parseInt(e.target.value);
        masterVolumeValue.textContent = masterVolume;
      });
    }

    // Music volume slider
    const musicVolumeSlider = document.getElementById('musicVolume');
    const musicVolumeValue = document.getElementById('musicVolumeValue');
    if (musicVolumeSlider && musicVolumeValue) {
      musicVolumeSlider.addEventListener('input', (e) => {
        musicVolume = parseInt(e.target.value);
        musicVolumeValue.textContent = musicVolume;
      });
    }

    // SFX volume slider
    const sfxVolumeSlider = document.getElementById('sfxVolume');
    const sfxVolumeValue = document.getElementById('sfxVolumeValue');
    if (sfxVolumeSlider && sfxVolumeValue) {
      sfxVolumeSlider.addEventListener('input', (e) => {
        sfxVolume = parseInt(e.target.value);
        sfxVolumeValue.textContent = sfxVolume;
      });
    }

    // Mouse sensitivity slider
    const mouseSensitivitySlider = document.getElementById('mouseSensitivity');
    const mouseSensitivityValue = document.getElementById('mouseSensitivityValue');
    if (mouseSensitivitySlider && mouseSensitivityValue) {
      mouseSensitivitySlider.addEventListener('input', (e) => {
        mouseSensitivity = parseInt(e.target.value);
        mouseSensitivityValue.textContent = mouseSensitivity;
      });
    }
  }

  createWorld() {
    return new Promise((resolve, reject) => {
    try {
      console.log('Starting world creation...');
      
      // Start loading the world
      isLoading = true;
      
      // Hide all menus
      document.querySelectorAll('.menu-container').forEach(menu => {
        menu.classList.add('hidden');
      });
      
      // Initialize world with current settings
      if (!worldName.trim()) {
        worldName = 'New World';
      }
      
      // Set world seed if provided
      if (worldSeed && worldSeed.trim() !== '') {
        const seed = parseInt(worldSeed);
        if (!isNaN(seed)) {
          currentSeed = seed;
        }
      }
      
      console.log('Creating World instance...');
      // Create the world instance
      const WORLD_WIDTH = 2000;
      const WORLD_HEIGHT = 200;
      world = new World(WORLD_WIDTH, WORLD_HEIGHT, registry);
      console.log('World instance created successfully');
      console.log('Initial world setup:', { 
        width: WORLD_WIDTH, 
        height: WORLD_HEIGHT,
        seed: currentSeed 
      });
      

      
      // Initialize mod manager with registry and world
      if (window.modManager) {
        try {
          window.modManager.initialize(registry, world);
          console.log('Mod manager initialized');
        } catch (e) {
          console.error('Mod manager initialization error:', e);
        }
      } else {
        console.log('No mod manager available');
      }
      
      // Set world seed
      world.seed = currentSeed;
      console.log('World seed set:', currentSeed);
      
      // Set random time of day with better distribution
      randomTime = Math.random();
      world.time = randomTime * world.dayLength;
      world.timeManuallySet = false; // Initialize flag
      console.log(`World spawned with random time: ${Math.floor(randomTime * 24)}:${Math.floor((randomTime * 24 - Math.floor(randomTime * 24)) * 60).toString().padStart(2, '0')}`);
      console.log(`Initial world time: ${world.time}, Day length: ${world.dayLength}`);
      
      // Set world properties
      world.items = items;
      world.worldType = worldType;
      world.cheatsEnabled = worldCheatsEnabled;
      world.allowCommands = worldAllowCommands;
      
      // Set superflat layers if applicable
      if (worldType === 'superflat') {
        world.superflatLayers = [...worldSuperflatLayers];
      }
      
      // Set game mode
      creativeMode = worldGameMode === 'creative';
      world.creativeMode = creativeMode;
      
      // Set starting time
      const timeMap = {
        'day': 0.5,
        'night': 0.0,
        'sunset': 0.75,
        'dawn': 0.25
      };
      world.time = (timeMap[worldStartingTime] || 0.5) * world.dayLength;
      
      // Set world size
      const sizeMap = {
        'small': 1000,
        'normal': 2000,
        'large': 4000
      };
      world.width = sizeMap[worldSize] || 2000;
      world.height = 200; // Fixed reasonable height, not square!
      console.log('World size configured:', { 
        width: world.width, 
        height: world.height, 
        selectedSize: worldSize 
      });
      
      // Initialize player after world is created
      console.log('Creating player...');
      console.log('World dimensions:', { width: world.width, height: world.height });
      console.log('TILE_SIZE:', TILE_SIZE);
      console.log('spawnTileX:', spawnTileX);
      console.log('spawnX:', spawnX);
      
      // Start player at surface level, not in the air
      const surfaceY = 60; // Start at a reasonable surface level
      const tempSpawnY = surfaceY * TILE_SIZE;
      console.log('Setting player spawn Y to:', tempSpawnY, '(tile:', surfaceY, ')');
      
      player = new Player(world, registry, spawnX, tempSpawnY);
      player.onGround = false;
      console.log('Player created at position:', { x: player.x, y: player.y });
      console.log('Player tile position:', { 
        tileX: Math.floor(player.x / TILE_SIZE), 
        tileY: Math.floor(player.y / TILE_SIZE) 
      });
      
      // Show the game canvas
      const gameCanvas = document.getElementById('gameCanvas');
      if (gameCanvas) {
        gameCanvas.classList.remove('hidden');
        console.log('Game canvas shown');
      }
      
      // Initialize core game components after world and player are created
      console.log('Initializing game components...');
      
      // Initialize camera if not already done
      if (!window.camera) {
        window.camera = new Camera();
        console.log('Camera created');
      }
      
      // Update renderer with game world data
      if (window.renderer && canvas && ctx) {
        // Update the existing renderer with world data
        window.renderer.world = world;
        window.renderer.player = player;
        window.renderer.inventory = inventory;
        window.renderer.breaker = breaker;
        console.log('Renderer updated with game data');
      } else if (canvas && ctx) {
        // Create new renderer if it doesn't exist
        window.renderer = new Renderer(
          ctx, canvas, world, registry, window.camera, window.input, player, inventory, breaker,
          () => ({
            selectedIndex,
            inventoryOpen,
            openContainer,
            draggingStack,
            craftGrid,
            inventoryCraftGrid,
            craftOutput,
            creativeMode,
            creativeTab,
            creativeScrollY,
            textInputMode,
            textInputValue,
            commandSuggestions,
            selectedSuggestionIndex,
            itemSuggestions,
            selectedItemIndex,
            currentCommand,
            currentArgIndex,
            items,
            leafParticles,
            bees,
            backgroundBlocks,
            keybinds,
            rebindingKey,
            menuPatterns: null,
            // Graphics settings
            renderDistance: renderDistance,
            textureQuality: textureQuality,
            renderFallingLeaves: renderFallingLeaves,
            autoJump: autoJump
          }),
          placer
        );
        
        // Make background blocks available to renderer
        window.backgroundBlocks = backgroundBlocks;
        
        // Preload renderer textures
        window.renderer.preloadTextures();
        
        console.log('Renderer created successfully');
      }
      
      // Initialize game engine
      initializeGameEngine();
      console.log('Game engine initialized');
      
      // Load the world asynchronously
      (async () => {
        try {
          console.log('=== WORLD LOADING START ===');
          console.log('Loading chunks around spawn X:', spawnTileX);
          await loadInitialChunks(spawnTileX);
          console.log('Chunks loaded successfully');
          
          // Initialize lighting after chunks are loaded
          setTimeout(() => {
            try {
              // Initialize lighting for spawn area chunks
              const centerX = spawnTileX;
              console.log('Initializing lighting...');
              world.initializeLighting();
              console.log('Lighting initialization complete');
            } catch (e) {
              console.error('Lighting initialization error:', e);
            }
          }, 100);
          
          console.log('=== COMPUTING SPAWN POSITION ===');
          try {
            const spawnResult = computeSeededSpawn(spawnTileX);
            console.log('Spawn computation result:', spawnResult);
          } catch (spawnError) {
            console.error('ERROR in computeSeededSpawn:', spawnError);
          }
          
          console.log('=== ENSURING PLAYER NOT IN SOLID ===');
          try {
          ensurePlayerNotInSolid();
          } catch (ensureError) {
            console.error('ERROR in ensurePlayerNotInSolid:', ensureError);
          }
          
          console.log('Final player position:', { 
            x: player.x, 
            y: player.y,
            tileX: Math.floor(player.x / TILE_SIZE),
            tileY: Math.floor(player.y / TILE_SIZE)
          });
          
          // Mark loading as complete
          isLoading = false;
          console.log('World loading complete, starting game...');
          
          // Check if this is a multiplayer world creation
          if (window.pendingMultiplayerRoom) {
            console.log('World created for multiplayer - enabling Continue button...');
            // Show the Continue button so user can go back to room setup
            const continueButton = document.getElementById('continueButton');
            if (continueButton) {
              continueButton.disabled = false;
              continueButton.textContent = 'Continue';
            }
          }
          
          // Ensure the game canvas is visible and start rendering
          if (gameCanvas) {
            gameCanvas.style.display = 'block';
          }
          
          // Resolve the promise
          resolve();
          
        } catch (error) {
          console.error('Error loading world:', error);
          isLoading = false;
          reject(error);
        }
      })();
      
      // Add a timeout to prevent infinite loading
      setTimeout(() => {
        if (isLoading) {
          console.log('Loading timeout reached, forcing completion...');
          isLoading = false;
          
          // Ensure the game canvas is visible even if loading fails
          const gameCanvas = document.getElementById('gameCanvas');
          if (gameCanvas) {
            gameCanvas.style.display = 'block';
          }
          
          // Resolve anyway - world creation may have succeeded partially
          resolve();
        }
      }, 10000); // 10 second timeout
      
    } catch (error) {
      console.error('=== CRITICAL ERROR IN CREATEWORLD ===');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('Error details:', error);
      
      // Log current state for debugging
      console.log('Current state when error occurred:');
      console.log('- World exists:', !!world);
      console.log('- Player exists:', !!player);
      console.log('- Renderer exists:', !!window.renderer);
      console.log('- Loading state:', isLoading);
      
      isLoading = false;
      
      // Show detailed error message to user
      alert(`Failed to create world: ${error.message}\n\nCheck console for detailed logs.`);
      
      // Go back to main menu
      this.showMenu('mainMenu');
      
      // Reject the promise
      reject(error);
    }
    });
  }

  hideAllMenus() {
    document.querySelectorAll('.menu-container').forEach(menu => {
      menu.classList.add('hidden');
    });
    
    // Stop room discovery when entering game
    this.stopRoomDiscovery();
    
    // Clean up hosted room if we're hosting
    if (window.hostedRoom) {
      console.log('Cleaning up hosted room on game start');
      this.removeHostedRoom();
    }
  }

  showMainMenu() {
    this.showMenu('mainMenu');
    
    // Stop the game loop and unload the world
    if (window.engine) {
      window.engine.stop();
    }
    
    // Reset game state
    gamePaused = false;
    
    // Keep canvas visible for menu background
    // Canvas will be hidden when world is created
    
    // Reset any game-related variables
    if (window.world) {
      window.world = null;
    }
    if (window.player) {
      window.player = null;
    }
    
    // Clean up multiplayer hosting
    if (window.hostedRoom) {
      console.log('Stopping multiplayer hosting...');
      this.cleanupMultiplayerHost();
    }
    
    // Clean up multiplayer client
    if (window.multiplayerConnection || window.isMultiplayerClient) {
      console.log('Disconnecting from multiplayer...');
      this.cleanupMultiplayerClient();
      if (window.multiplayerConnection && window.multiplayerConnection.open) {
        window.multiplayerConnection.close();
      }
    }
    if (window.inventory) {
      window.inventory = null;
    }
    
    // Update renderer's world reference
    if (window.renderer) {
      window.renderer.world = null;
    }
    
    console.log('Returned to main menu - world unloaded');
  }
  
  showPauseMenu() {
    this.showMenu('pauseMenu');
    gamePaused = true;
    // Update the renderer's UI state
    if (window.renderer && window.renderer.getUI) {
      const ui = window.renderer.getUI();
      ui.gamePaused = true;
    }
  }
  
  resumeGame() {
    // Hide pause menu and show game canvas
    document.getElementById('pauseMenu').classList.add('hidden');
    document.getElementById('gameCanvas').classList.remove('hidden');
    gamePaused = false;
    // Update the renderer's UI state
    if (window.renderer && window.renderer.getUI) {
      const ui = window.renderer.getUI();
      ui.gamePaused = false;
    }
  }
  


  populateModsMenu() {
    const modsGrid = document.getElementById('modsGrid');
    if (!modsGrid) return;

    modsGrid.innerHTML = '';
    
    console.log('Populating mods menu, modManager:', window.modManager);
    
    if (window.modManager) {
      const mods = window.modManager.getAllMods();
      console.log('Available mods:', mods);
      mods.forEach(mod => {
        console.log('Creating mod card for:', mod);
        console.log('Mod properties:', {
          id: mod.id,
          name: mod.name,
          description: mod.description,
          version: mod.version,
          author: mod.author,
          thumbnail: mod.thumbnail
        });
        const modCard = this.createModCard(mod);
        modsGrid.appendChild(modCard);
      });
    } else {
      console.log('No modManager found');
    }
  }

  createModCard(mod) {
    const card = document.createElement('div');
    card.className = 'mod-card';
    if (window.modManager && window.modManager.isModEnabled(mod.id)) {
      card.classList.add('enabled');
    }

    card.innerHTML = `
      <img src="${mod.thumbnail}" alt="${mod.name}" class="mod-thumbnail">
      <div class="mod-name">${mod.name}</div>
    `;

    card.addEventListener('click', () => {
      console.log('Mod card clicked:', mod);
      this.showModDetails(mod);
    });

    return card;
  }

  showModDetails(mod) {
    this.currentMod = mod;
    
    console.log('Showing mod details:', mod);
    
    // Get all the UI elements
    const thumbnail = document.getElementById('modThumbnail');
    const name = document.getElementById('modName');
    const description = document.getElementById('modDescription');
    const version = document.getElementById('modVersion');
    const author = document.getElementById('modAuthor');
    
    console.log('Found UI elements:', { thumbnail, name, description, version, author });
    
    // Check if elements exist and update them
    if (thumbnail) {
      thumbnail.src = mod.thumbnail || '';
      console.log('Set thumbnail to:', mod.thumbnail);
    } else {
      console.error('Thumbnail element not found!');
    }
    
    if (name) {
      name.textContent = mod.name || 'Unknown Mod';
      console.log('Set name to:', mod.name);
    } else {
      console.error('Name element not found!');
    }
    
    if (description) {
      description.textContent = mod.description || 'No description available';
      console.log('Set description to:', mod.description);
    } else {
      console.error('Description element not found!');
    }
    
    if (version) {
      version.textContent = `Version ${mod.version || '1.0.0'}`;
      console.log('Set version to:', mod.version);
    } else {
      console.error('Version element not found!');
    }
    
    if (author) {
      author.textContent = `by ${mod.author || 'Unknown'}`;
      console.log('Set author to:', mod.author);
    } else {
      console.error('Author element not found!');
    }

    const toggleButton = document.getElementById('modToggleButton');
    if (window.modManager && window.modManager.isModEnabled(mod.id)) {
      toggleButton.textContent = 'Disable Mod';
      toggleButton.setAttribute('data-action', 'disable-mod');
    } else {
      toggleButton.textContent = 'Enable Mod';
      toggleButton.setAttribute('data-action', 'enable-mod');
    }

    this.showMenu('modDetailsMenu');
    
    // Debug: Log the current menu state
    console.log('Current menu:', this.currentMenu);
    console.log('Mod details menu visible:', !document.getElementById('modDetailsMenu').classList.contains('hidden'));
    
    // Double-check that the menu is visible
    const modDetailsMenu = document.getElementById('modDetailsMenu');
    if (modDetailsMenu) {
      modDetailsMenu.classList.remove('hidden');
      console.log('Forced mod details menu to be visible');
    } else {
      console.error('Mod details menu element not found!');
    }
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

    // Update the mods menu to reflect changes
    this.populateModsMenu();
  }

  startKeybindRebinding(action) {
    console.log('Starting keybind rebinding for:', action);
    if (rebindingKey) {
      console.log('Already rebinding, ignoring');
      return; // Already rebinding
    }
    
    rebindingKey = action;
    const button = document.querySelector(`[data-action="bind-${action}"]`);
    if (button) {
      console.log('Found button, making it blank and adding binding class');
      button.classList.add('binding');
      button.textContent = '';  // Make it blank immediately
    } else {
      console.log('Could not find button for action:', action);
    }
    
    // Add global key listener for rebinding
    this.rebindingListener = (e) => {
      e.preventDefault();
      console.log('Key pressed during rebinding:', e.code);
      this.finishKeybindRebinding(action, e.code);
    };
    document.addEventListener('keydown', this.rebindingListener);
    console.log('Added keydown listener for rebinding');
  }

  finishKeybindRebinding(action, keyCode) {
    if (!rebindingKey || rebindingKey !== action) return;
    
    // Update the temporary keybind (not saved yet)
    tempKeybinds[action] = keyCode;
    
    // Update the button display
    const button = document.querySelector(`[data-action="bind-${action}"]`);
    if (button) {
      button.classList.remove('binding');
      button.textContent = this.getKeyDisplayName(keyCode);
      button.setAttribute('data-key', keyCode);
      button.classList.add('modified'); // Show it's been changed
    }
    
    // Remove the rebinding listener
    if (this.rebindingListener) {
      document.removeEventListener('keydown', this.rebindingListener);
      this.rebindingListener = null;
    }
    
    rebindingKey = null;
    console.log(`Temporary keybind set: ${action} = ${keyCode} (not saved yet)`);
  }

  applyKeybindChanges() {
    // Copy temp keybinds to actual keybinds
    Object.assign(keybinds, tempKeybinds);
    
    // Save to localStorage
    saveKeybinds();
    
    // Remove all 'modified' classes
    document.querySelectorAll('.keybind-button.modified').forEach(button => {
      button.classList.remove('modified');
    });
    
    console.log('Keybind changes applied and saved!');
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
    // Reset temp keybinds to default
    tempKeybinds = {
      forward: 'KeyW',
      backward: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      jump: 'Space',
      sprint: 'ShiftLeft',
      inventory: 'KeyE',
      chat: 'KeyT',
      drop: 'KeyQ',
      pause: 'Escape',
      background: 'KeyZ',
      rotate: 'KeyR',
      flip: 'KeyF'
    };
    
    // Update all keybind buttons to show defaults (not saved yet)
    Object.entries(tempKeybinds).forEach(([action, keyCode]) => {
      const button = document.querySelector(`[data-action="bind-${action}"]`);
      if (button) {
        button.textContent = this.getKeyDisplayName(keyCode);
        button.setAttribute('data-key', keyCode);
        button.classList.add('modified'); // Show they've been changed
      }
    });
    
    console.log('Keybinds reset to default (not saved yet - click Apply to save)');
  }

  initializeBackgroundUI() {
    // Ensure there's always at least one block
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
    
    backgroundBlocks.forEach((blockId, index) => {
      const blockDiv = document.createElement('div');
      blockDiv.className = 'background-block';
      
      // Add block icon
      const blockIcon = document.createElement('img');
      blockIcon.className = 'background-block-icon';
      blockIcon.src = `textures/${blockId}.png`;
      blockIcon.alt = blockId;
      blockIcon.onerror = () => {
        blockIcon.src = 'textures/stone.png'; // Fallback texture
      };
      
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'minecraft-input small';
      input.value = blockId;
      input.addEventListener('change', (e) => {
        backgroundBlocks[index] = e.target.value.trim();
        // Don't save immediately, wait for apply button
      });
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'minecraft-button small';
      removeBtn.textContent = 'Remove';
      
      // Disable remove button if this is the last block (minimum 1 block required)
      if (backgroundBlocks.length === 1) {
        removeBtn.disabled = true;
        removeBtn.classList.add('disabled');
        removeBtn.style.opacity = '0.5';
        removeBtn.style.cursor = 'not-allowed';
      } else {
        removeBtn.addEventListener('click', () => this.removeBackgroundBlock(index));
      }
      
      blockDiv.appendChild(blockIcon);
      blockDiv.appendChild(input);
      blockDiv.appendChild(removeBtn);
      container.appendChild(blockDiv);
    });
  }

  removeBackgroundBlock(index) {
    if (index >= 0 && index < backgroundBlocks.length && backgroundBlocks.length > 1) {
      backgroundBlocks.splice(index, 1);
      window.backgroundBlocks = backgroundBlocks;
      this.updateBackgroundUI();
      // Don't save immediately, wait for apply button
    }
  }

  bindBackgroundInput() {
    const input = document.getElementById('backgroundBlockInput');
    const suggestions = document.getElementById('backgroundSuggestions');
    
    if (!input || !suggestions) return;
    
    input.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      if (query.length === 0) {
        suggestions.classList.add('hidden');
        return;
      }
      
      this.showBlockSuggestions(query, suggestions);
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const blockId = e.target.value.trim();
        if (blockId) {
          this.addBackgroundBlock(blockId);
          e.target.value = '';
          suggestions.classList.add('hidden');
        }
      }
    });
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !suggestions.contains(e.target)) {
        suggestions.classList.add('hidden');
      }
    });
  }

  showBlockSuggestions(query, suggestionsContainer) {
    suggestionsContainer.innerHTML = '';
    
    const allBlocks = [];
    
    // Check if registry is available
    if (window.registry) {
      for (const [id, block] of window.registry.entries()) {
        if (id !== 'air') {
          allBlocks.push({ 
            id, 
            displayName: block.displayName || id,
            texture: `textures/${id}.png`
          });
        }
      }
    } else {
      console.warn('Registry not available for block suggestions');
    }
    
    const filteredBlocks = allBlocks.filter(block => 
      block.id.toLowerCase().includes(query) ||
      block.displayName.toLowerCase().includes(query)
    ).slice(0, 10);
    
    if (filteredBlocks.length === 0) {
      suggestionsContainer.classList.add('hidden');
      return;
    }
    
    filteredBlocks.forEach(block => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.innerHTML = `
        <img src="${block.texture}" alt="${block.id}" class="suggestion-icon">
        <span class="suggestion-text">${block.displayName}</span>
        <span class="suggestion-type">block</span>
      `;
      
      item.addEventListener('click', () => {
        this.addBackgroundBlock(block.id);
        document.getElementById('backgroundBlockInput').value = '';
        suggestionsContainer.classList.add('hidden');
      });
      
      suggestionsContainer.appendChild(item);
    });
    
    suggestionsContainer.classList.remove('hidden');
  }

  addBackgroundBlock(blockId) {
    if (!blockId || !blockId.trim()) return;
    
    const trimmedId = blockId.trim();
    
    // Don't be too strict about registry check - allow adding blocks even if not in registry
    // This allows for future blocks or custom blocks
    if (window.registry && !window.registry.has(trimmedId)) {
      console.warn(`Block ID not found in registry: ${trimmedId}, but adding anyway`);
    }
    
    if (!backgroundBlocks.includes(trimmedId)) {
      backgroundBlocks.push(trimmedId);
      window.backgroundBlocks = backgroundBlocks;
      this.updateBackgroundUI();
      // Don't save immediately, wait for apply button
    }
  }

  discoverServers() {
    console.log('Discovering servers...');
    // Simulate server discovery
    const serverList = document.getElementById('serverList');
    if (serverList) {
      serverList.innerHTML = `
        <div class="server-item">
          <span class="server-name">Local Server (127.0.0.1:25565)</span>
          <span class="server-status online">Online</span>
          <span class="server-players">0/20</span>
        </div>
        <div class="server-item">
          <span class="server-name">Test Server (192.168.1.100:25565)</span>
          <span class="server-status online">Online</span>
          <span class="server-players">5/20</span>
        </div>
      `;
    }
  }

  refreshServers() {
    console.log('Refreshing servers...');
    this.discoverServers();
  }

  connectToServer() {
    const address = document.getElementById('serverAddress').value;
    const port = document.getElementById('serverPort').value;
    const username = document.getElementById('playerUsername').value;
    
    console.log(`Connecting to ${address}:${port} as ${username}...`);
    // TODO: Implement actual server connection
    alert(`Connecting to ${address}:${port} as ${username}...\n\nNote: This is a placeholder. Actual multiplayer functionality will be implemented in future updates.`);
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
    // Save the current background configuration
    saveBackgroundConfig();
    
    // Force renderer to redraw background
    if (window.renderer) {
      // Clear ALL pattern caches to force regeneration
      window.renderer.mainMenuPatterns = null;
      window.renderer.optionsMenuPatterns = null;
      window.renderer.createWorldPatterns = null;
      window.renderer.loadWorldPatterns = null;
      window.renderer.pauseMenuPatterns = null;
      window.renderer.menuBackgroundPatterns = null;
      
      // Force a redraw by calling the engine's render method
      if (window.engine && window.engine.render) {
        // Add a small delay to ensure global variables are updated
        setTimeout(() => {
          window.engine.render();
        }, 100);
      }
    }
    
    // Show feedback to user and go back to main menu
    const applyButton = document.querySelector('[data-action="apply-background"]');
    if (applyButton) {
      const originalText = applyButton.textContent;
      applyButton.textContent = 'Applied!';
      
      // Go back to main menu after a short delay so user can see "Applied!"
      setTimeout(() => {
        this.showMenu('mainMenu');
      }, 800);
    }
    
    // Log the current background configuration for debugging
    console.log('Background configuration applied:', backgroundBlocks);
    console.log('Global backgroundBlocks:', window.backgroundBlocks);
    
    // Force renderer to redraw background
    if (window.renderer) {
      // Clear the main menu patterns to force regeneration
      window.renderer.mainMenuPatterns = null;
      window.renderer.optionsMenuPatterns = null;
      window.renderer.menuBackgroundPatterns = null;
      
      // Force a redraw by calling the engine's render method
      if (window.engine && window.engine.render) {
        window.engine.render();
      }
    }
  }
  
  randomizeBackground() {
    // Get the number of blocks to randomize
    const countInput = document.getElementById('randomizeCount');
    const count = parseInt(countInput.value) || 5;
    
    // Get all available blocks from the registry
    const availableBlocks = Array.from(window.registry.map.keys());
    
    // Filter out blocks that might not have textures (like air, etc.)
    const validBlocks = availableBlocks.filter(blockId => 
      blockId !== 'air' && 
      !blockId.includes('_stairs') && 
      !blockId.includes('_slab') &&
      !blockId.includes('_trapdoor') &&
      !blockId.includes('_door') &&
      blockId !== 'torch' &&
      blockId !== 'crafting_table' &&
      blockId !== 'furnace' &&
      blockId !== 'chest'
    );
    
    // Generate random blocks (ensure we don't exceed available blocks)
    const randomCount = Math.min(count, validBlocks.length);
    const randomBlocks = [];
    
    // Use Fisher-Yates shuffle to get truly random blocks
    const shuffled = [...validBlocks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // Take the first 'randomCount' blocks
    randomBlocks.push(...shuffled.slice(0, randomCount));
    
    // Update the background blocks array
    backgroundBlocks.length = 0;
    backgroundBlocks.push(...randomBlocks);
    
    // Update the UI
    this.updateBackgroundUI();
    
    // Show feedback
    const randomizeButton = document.querySelector('[data-action="randomize-background"]');
    if (randomizeButton) {
      randomizeButton.textContent = 'Randomized!';
      setTimeout(() => {
        randomizeButton.textContent = 'Randomize';
      }, 1000);
    }
    
    console.log(`Randomized background with ${randomBlocks.length} blocks:`, randomBlocks);
  }
  
  initializeMultiplayer() {
    console.log('Initializing multiplayer system...');
    
    // Load saved username and set it in the multiplayer menu
    const savedUsername = localStorage.getItem('playerUsername') || 'Player';
    const usernameInput = document.getElementById('playerUsername');
    if (usernameInput) {
      usernameInput.value = savedUsername;
      
      // Save username to localStorage when changed
      usernameInput.addEventListener('input', (e) => {
        localStorage.setItem('playerUsername', e.target.value);
      });
    }
    
    this.startRoomDiscovery();
    
    // Initialize network with retry mechanism
    this.initializeMultiplayerNetworkWithRetry();
  }

  initializeMultiplayerNetworkWithRetry() {
    console.log('Initializing multiplayer network with retry...');
    
    try {
      this.initializeMultiplayerNetwork();
    } catch (error) {
      console.error('Failed to initialize multiplayer network:', error);
      
      // Retry after a delay
      setTimeout(() => {
        console.log('Retrying multiplayer network initialization...');
        this.initializeMultiplayerNetworkWithRetry();
      }, 3000);
    }
  }
  
  initializeMultiplayerNetwork() {
    console.log('Initializing multiplayer network...');
    
    // Check if PeerJS is available
    if (typeof Peer === 'undefined') {
      console.error('PeerJS library not loaded!');
      alert('Multiplayer is not available. Please refresh the page and try again.');
      return;
    }
    
    // Initialize PeerJS for room discovery and communication
    if (!window.multiplayerPeer) {
      console.log('Creating new PeerJS instance...');
      
      // Configure PeerJS with more aggressive connection options
      const peerConfig = {
        debug: 3, // Enable debug logging
        config: {
          'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
            { urls: 'stun:stun.nextcloud.com:443' },
            // Add TURN servers for better connectivity
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject', 
              credential: 'openrelayproject'
            }
          ],
          'iceTransportPolicy': 'all',
          'bundlePolicy': 'max-bundle',
          'rtcpMuxPolicy': 'require',
          'iceCandidatePoolSize': 10
        }
      };
      
      try {
        window.multiplayerPeer = new Peer(peerConfig);
      } catch (error) {
        console.error('Failed to create PeerJS instance:', error);
        alert('Failed to initialize multiplayer. Please try again.');
        return;
      }
      
      window.multiplayerPeer.on('open', (id) => {
        console.log('Multiplayer peer ID:', id);
        window.myPeerId = id;
        console.log('PeerJS connection established successfully');
        console.log('Peer is ready to accept connections');
      });
      
      window.multiplayerPeer.on('connection', (conn) => {
        console.log('Incoming connection from:', conn.peer);
        this.handleIncomingConnection(conn);
      });
      
      window.multiplayerPeer.on('error', (err) => {
        console.error('Multiplayer peer error:', err);
        
        // If it's a connection error, try to reconnect
        if (err.type === 'peer-unavailable' || err.type === 'network') {
          console.log('Connection error, attempting to reconnect...');
          setTimeout(() => {
            if (window.multiplayerPeer) {
              window.multiplayerPeer.destroy();
              window.multiplayerPeer = null;
              window.myPeerId = null;
              this.initializeMultiplayerNetwork();
            }
          }, 2000);
        }
      });
      
      window.multiplayerPeer.on('disconnected', () => {
        console.log('PeerJS disconnected');
      });
      
      window.multiplayerPeer.on('close', () => {
        console.log('PeerJS connection closed');
      });
    } else {
      console.log('PeerJS already initialized, peer ID:', window.myPeerId);
    }
  }
  
  startRoomDiscovery() {
    console.log('Starting room discovery...');
    this.updateRoomsStatus('Searching for rooms...');
    
    // Clear existing rooms
    this.clearRoomsList();
    
    // Start discovery process
    this.discoverRooms();
    
    // Set up periodic refresh
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }
    this.discoveryInterval = setInterval(() => {
      this.discoverRooms();
    }, 1000); // Refresh every 1 second
  }

  stopRoomDiscovery() {
    console.log('Stopping room discovery...');
    
    // Clear the discovery interval
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    
    // Clear the rooms list
    this.clearRoomsList();
    this.updateRoomsStatus('Room discovery stopped');
  }
  
  discoverRooms() {
    console.log('Discovering active rooms...');
    
    try {
      const hostedRooms = JSON.parse(localStorage.getItem('hostedRooms') || '[]');
      const now = Date.now();
      
      // Filter for active rooms (within last 10 seconds - very short timeout)
      const activeRooms = hostedRooms.filter(room => {
        return (now - room.timestamp) < 10 * 1000; // 10 seconds
      });
      
      // Remove expired rooms from localStorage
      if (activeRooms.length < hostedRooms.length) {
        localStorage.setItem('hostedRooms', JSON.stringify(activeRooms));
        console.log(`Removed ${hostedRooms.length - activeRooms.length} expired rooms`);
      }
      
      console.log(`Found ${activeRooms.length} active rooms`);
      this.updateRoomsList(activeRooms);
    } catch (error) {
      console.error('Error discovering rooms:', error);
      this.updateRoomsList([]);
    }
  }
  
  updateRoomsList(rooms) {
    const roomsList = document.getElementById('roomsList');
    if (!roomsList) return;
    
    if (rooms.length === 0) {
      roomsList.innerHTML = `
        <div class="no-rooms-message">
          <p>No rooms found on the network</p>
          <p style="font-size: 14px; color: #888;">Create a room or wait for others to host</p>
        </div>
      `;
      this.updateRoomsStatus('No rooms found');
    } else {
      roomsList.innerHTML = rooms.map(room => this.createRoomElement(room)).join('');
      this.updateRoomsStatus(`Found ${rooms.length} room${rooms.length === 1 ? '' : 's'}`);
    }
  }
  
  createRoomElement(room) {
    const isFull = room.players >= room.maxPlayers;
    const worldName = room.worldName || 'Unknown World';
    const gameMode = room.gameMode || 'survival';
    const gameModeDisplay = gameMode.charAt(0).toUpperCase() + gameMode.slice(1);
    
    return `
      <div class="room-item" data-room-id="${room.id}">
        <div class="room-info">
          <div class="room-name">${worldName}</div>
          <div class="room-details">Host: ${room.host} • ${gameModeDisplay}</div>
        </div>
        <div class="room-players">
          <span class="room-players-count ${isFull ? 'full' : ''}">${room.players}/${room.maxPlayers}</span>
          <button class="room-join-btn" ${isFull ? 'disabled' : ''} onclick="menuManager.joinRoom('${room.id}', '${room.peerId}')">
            ${isFull ? 'Full' : 'Join'}
          </button>
        </div>
      </div>
    `;
  }
  
  updateRoomsStatus(status) {
    const statusElement = document.getElementById('roomsStatus');
    if (statusElement) {
      statusElement.textContent = status;
    }
  }
  
  clearRoomsList() {
    const roomsList = document.getElementById('roomsList');
    if (roomsList) {
      roomsList.innerHTML = `
        <div class="no-rooms-message">
          <p>Searching for rooms...</p>
        </div>
      `;
    }
  }
  
  refreshRooms() {
    console.log('Refreshing rooms...');
    this.startRoomDiscovery();
  }
  
  joinRoom(roomId, peerId) {
    console.log(`Joining room ${roomId} via peer ${peerId}`);
    const username = localStorage.getItem('playerUsername') || document.getElementById('playerUsername').value || 'Player';
    
    // Verify room is still active before attempting to join
    const hostedRooms = JSON.parse(localStorage.getItem('hostedRooms') || '[]');
    const room = hostedRooms.find(r => r.id === roomId);
    
    if (!room) {
      console.log('Room not found in active rooms list');
      alert('Room is no longer available');
      this.showMenu('multiplayerMenu');
      return;
    }
    
    const now = Date.now();
    if (now - room.timestamp > 10 * 1000) {
      console.log('Room has expired');
      alert('Room has expired');
      this.showMenu('multiplayerMenu');
      return;
    }
    
    console.log('Room verified as active, proceeding with join');
    
    // Stop room discovery when joining a room
    this.stopRoomDiscovery();
    
    // Check if peer is ready
    if (!window.multiplayerPeer || !window.myPeerId) {
      console.log('Peer not ready, initializing...');
      this.initializeMultiplayerNetwork();
      
      // Wait for peer to be ready
      setTimeout(() => {
        this.joinRoom(roomId, peerId);
      }, 1000);
      return;
    }
    
    console.log('Attempting to connect to peer:', peerId);
    
    // Test if we can reach the host first
    console.log('Testing host connectivity...');
    
    // Connect to the room host with retry mechanism
    console.log('Creating connection to peer:', peerId);
    this.attemptConnectionWithRetry(peerId, username, 0);
  }
  
  attemptConnectionWithRetry(peerId, username, attempt) {
    const maxAttempts = 3;
    console.log(`Connection attempt ${attempt + 1}/${maxAttempts} to peer:`, peerId);
    
    if (attempt >= maxAttempts) {
      alert('Failed to connect after multiple attempts. Please try again or ask the host to restart their game.');
      this.showMenu('multiplayerMenu');
      return;
    }
    
    const conn = window.multiplayerPeer.connect(peerId, {
      reliable: true,
      serialization: 'json',
      label: 'multiplayer-game-data'
    });
    
    console.log('Connection object created:', conn);
    console.log('Connection state:', conn.open);
    console.log('Connection peer:', conn.peer);
    console.log('Connection type:', conn.type);
    
    // Mark creation time for ultra aggressive timeout
    conn._createTime = Date.now();
    
    // Set a shorter timeout for each attempt, but also check WebRTC state
    const attemptTimeout = setTimeout(() => {
      if (!conn.open) {
        console.log(`Connection attempt ${attempt + 1} timed out, trying again...`);
        console.log('WebRTC state at timeout:', conn.peerConnection?.connectionState);
        console.log('ICE state at timeout:', conn.peerConnection?.iceConnectionState);
        
        try {
          conn.close();
        } catch (e) {
          console.error('Error closing failed connection:', e);
        }
        
        // Wait 2 seconds before retry
        setTimeout(() => {
          this.attemptConnectionWithRetry(peerId, username, attempt + 1);
        }, 2000);
      }
    }, 8000); // 8 second timeout per attempt
    
    // Also add a more aggressive check - sometimes the connection state changes but open event doesn't fire
    const aggressiveCheck = setInterval(() => {
      if (conn.open) {
        clearInterval(aggressiveCheck);
        return;
      }
      
      // Check if WebRTC is actually connected but PeerJS missed it
      if (conn.peerConnection) {
        const rtcState = conn.peerConnection.connectionState;
        const iceState = conn.peerConnection.iceConnectionState;
        
        console.log(`Aggressive check - RTC: ${rtcState}, ICE: ${iceState}, Open: ${conn.open}`);
        
        if ((rtcState === 'connected' || iceState === 'connected' || iceState === 'completed') && !conn.open) {
          console.log('Aggressive check found connected WebRTC, waiting for PeerJS to update...');
          // Let PeerJS handle the connection state naturally
        }
        
        // Check for stuck connections
        if (rtcState === 'new' && iceState === 'new' && !conn.open) {
          const timeSinceCreate = Date.now() - (conn._createTime || Date.now());
          if (timeSinceCreate > 5000) {
            console.log('Connection appears stuck, but letting PeerJS handle it...');
            // Modern PeerJS should handle this case better
          }
        }
      }
    }, 1000); // Check every second
    
    // Monitor WebRTC connection state changes
    if (conn.peerConnection) {
      console.log('WebRTC peer connection found, adding state listeners');
      
      conn.peerConnection.addEventListener('connectionstatechange', () => {
        console.log('WebRTC connection state changed:', conn.peerConnection.connectionState);
        
        // When WebRTC connects, check if we should proceed
        if (conn.peerConnection.connectionState === 'connected' && !conn.open) {
          console.log('WebRTC connected, waiting for data channel to open...');
          // Let PeerJS handle the connection state naturally
        }
      });
      
      conn.peerConnection.addEventListener('iceconnectionstatechange', () => {
        console.log('ICE connection state changed:', conn.peerConnection.iceConnectionState);
        
        // Also monitor ICE connection status
        if ((conn.peerConnection.iceConnectionState === 'connected' || 
             conn.peerConnection.iceConnectionState === 'completed') && !conn.open) {
          console.log('ICE connected, waiting for data channel to open...');
          // Let PeerJS handle the connection state naturally
        }
      });
      
      conn.peerConnection.addEventListener('icegatheringstatechange', () => {
        console.log('ICE gathering state changed:', conn.peerConnection.iceGatheringState);
      });
      
      conn.peerConnection.addEventListener('datachannel', (event) => {
        console.log('Data channel received:', event.channel);
        const channel = event.channel;
        
        channel.addEventListener('open', () => {
          console.log('Data channel opened - connection should be ready');
          clearTimeout(attemptTimeout);
          // PeerJS will handle setting conn.open automatically
        });
        
        channel.addEventListener('close', () => {
          console.log('Data channel closed');
        });
        
        channel.addEventListener('error', (error) => {
          console.error('Data channel error:', error);
        });
      });
    } else {
      console.log('No WebRTC peer connection found yet');
      
      // Check for peerConnection later
      setTimeout(() => {
        if (conn.peerConnection) {
          console.log('WebRTC peer connection found after delay');
          // Add the same listeners here if needed
        }
      }, 1000);
    }
    
    conn.on('open', () => {
      console.log(`Connected to room host successfully on attempt ${attempt + 1}`);
      console.log('Connection state after open:', conn.open);
      console.log('Sending join request with username:', username);
      
      // Clear both timeout and aggressive check since we succeeded
      clearTimeout(attemptTimeout);
      if (typeof aggressiveCheck !== 'undefined') {
        clearInterval(aggressiveCheck);
      }
      
      // Send join request immediately when connection opens
      try {
        conn.send({
          type: 'join_request',
          username: username,
          timestamp: Date.now()
        });
        console.log('Join request sent successfully');
      } catch (error) {
        console.error('Error sending join request:', error);
        alert('Failed to send join request');
        this.showMenu('multiplayerMenu');
      }
    });
    
    conn.on('data', (data) => {
      console.log('Received data from host:', data);
      this.handleMultiplayerMessage(conn, data);
    });
    
    // Connection monitoring is now handled by the timeout in attemptConnectionWithRetry
    
    conn.on('close', () => {
      console.log('Connection to host closed');
      if (window.isMultiplayerClient) {
        // Clean up multiplayer state
        this.cleanupMultiplayerClient();
        alert('Connection to host lost!');
        this.returnToMainMenu();
      }
    });
    
    conn.on('error', (err) => {
      console.error('Connection error:', err);
      if (window.isMultiplayerClient) {
        this.cleanupMultiplayerClient();
        alert(`Connection error: ${err.message || err.type || 'Unknown error'}`);
        this.returnToMainMenu();
      } else {
        alert('Failed to join room');
        this.showMenu('multiplayerMenu');
      }
    });
    
    // Connection error handling is now handled by the retry mechanism
  }
  
  // Room creation functionality
  initializeCreateRoom() {
    console.log('Initializing create room menu...');
    
    // Load saved username from localStorage
    const savedUsername = localStorage.getItem('playerUsername') || 'Player';
    
    // Set username in create room menu
    const createRoomUsernameInput = document.getElementById('createRoomUsername');
    if (createRoomUsernameInput) {
      createRoomUsernameInput.value = savedUsername;
      
      // Save username to localStorage when changed
      createRoomUsernameInput.addEventListener('input', (e) => {
        localStorage.setItem('playerUsername', e.target.value);
      });
    }
    
    // Set default world name if empty
    const roomNameInput = document.getElementById('roomName');
    if (roomNameInput && !roomNameInput.value) {
      roomNameInput.value = `${savedUsername}'s World`;
    }
    
    // Hide world configuration section initially
    const worldInfo = document.getElementById('configuredWorldInfo');
    if (worldInfo) {
      worldInfo.classList.add('hidden');
    }
    
    // Show Configure World button, hide Host Room button
    const createWorldBtn = document.getElementById('createWorldBtn');
    const hostRoomBtn = document.getElementById('hostRoomBtn');
    if (createWorldBtn) createWorldBtn.classList.remove('hidden');
    if (hostRoomBtn) hostRoomBtn.classList.add('hidden');
  }
  
  createMultiplayerWorld() {
    console.log('Setting up multiplayer world creation...');
    
    const roomName = document.getElementById('roomName').value || 'My World';
    const username = document.getElementById('createRoomUsername').value || 'Player';
    const maxPlayers = this.getSelectedMaxPlayers();
    
    // Save username to localStorage
    localStorage.setItem('playerUsername', username);
    
    // Store multiplayer room configuration for after world creation
    window.pendingMultiplayerRoom = {
      name: roomName,
      host: username,
      maxPlayers: maxPlayers,
      isMultiplayer: true
    };
    
    // Set the world name for the create world page
    worldName = roomName;
    
    console.log('Redirecting to create world page for multiplayer setup...');
    this.showMenu('createWorldMenu');
    
    // Update the world name input on the create world page
    const worldNameInput = document.getElementById('worldName');
    if (worldNameInput) {
      worldNameInput.value = roomName;
    }
    
    // Show multiplayer-specific buttons
    this.setupCreateWorldForMultiplayer();
  }
  
  setupCreateWorldForMultiplayer() {
    // Show ONLY Continue and Back to Room Setup buttons
    const createButton = document.querySelector('[data-action="create-world"]');
    const continueButton = document.getElementById('continueButton');
    const backToMainButton = document.getElementById('backToMainButton');
    const backToRoomButton = document.getElementById('backToRoomButton');
    
    // Hide Create World button completely
    if (createButton) createButton.style.display = 'none';
    
    // Show Continue button
    if (continueButton) {
      continueButton.classList.remove('hidden');
      continueButton.style.display = 'inline-block';
    }
    
    // Hide Back to Main button completely
    if (backToMainButton) backToMainButton.style.display = 'none';
    
    // Show Back to Room Setup button
    if (backToRoomButton) {
      backToRoomButton.classList.remove('hidden');
      backToRoomButton.style.display = 'inline-block';
    }
    
    console.log('Create world page configured for multiplayer - ONLY Continue and Back to Room Setup shown');
  }

  resetCreateWorldMenu() {
    // Reset to normal singleplayer state
    const createButton = document.querySelector('[data-action="create-world"]');
    const continueButton = document.getElementById('continueButton');
    const backToMainButton = document.getElementById('backToMainButton');
    const backToRoomButton = document.getElementById('backToRoomButton');
    
    // Show Create World button
    if (createButton) {
      createButton.style.display = 'inline-block';
    }
    
    // Hide Continue button
    if (continueButton) {
      continueButton.classList.add('hidden');
      continueButton.style.display = 'none';
    }
    
    // Show Back to Main button
    if (backToMainButton) {
      backToMainButton.style.display = 'inline-block';
    }
    
    // Hide Back to Room Setup button
    if (backToRoomButton) {
      backToRoomButton.classList.add('hidden');
      backToRoomButton.style.display = 'none';
    }
    
    console.log('Create world page reset to singleplayer state');
  }
  
  continueToRoom() {
    console.log('Saving world configuration and returning to room setup...');
    
    if (!window.pendingMultiplayerRoom) {
      console.error('No pending multiplayer room found');
      return;
    }
    
    // Save world configuration from the create world form
    this.saveWorldConfiguration();
    
    // Go back to create room menu
    this.showMenu('createRoomMenu');
    
    // Show the configured world info and Host Room button
    this.showWorldConfiguration();
  }
  
  saveWorldConfiguration() {
    // Get world configuration from the form
    const worldNameInput = document.getElementById('worldName');
    const worldSeedInput = document.getElementById('worldSeed');
    const gameModeSurvival = document.querySelector('[data-action="game-mode-survival"]');
    const gameModeCreative = document.querySelector('[data-action="game-mode-creative"]');
    
    // Save to the pending room config
    window.pendingMultiplayerRoom.worldConfig = {
      name: worldNameInput ? worldNameInput.value || 'New World' : 'New World',
      seed: worldSeedInput ? worldSeedInput.value || '' : '',
      gameMode: (gameModeSurvival && gameModeSurvival.hasAttribute('data-selected')) ? 'survival' : 'creative',
      worldType: worldType || 'regular',
      worldSize: worldSize || 'normal'
    };
    
    console.log('World configuration saved:', window.pendingMultiplayerRoom.worldConfig);
  }
  
  showWorldConfiguration() {
    const worldInfo = document.getElementById('configuredWorldInfo');
    const worldNameSpan = document.getElementById('configuredWorldName');
    const gameModeSpan = document.getElementById('worldGameModeDisplay');
    const worldTypeSpan = document.getElementById('worldTypeDisplay');
    const worldSizeSpan = document.getElementById('worldSizeDisplay');
    const createWorldBtn = document.getElementById('createWorldBtn');
    const hostRoomBtn = document.getElementById('hostRoomBtn');
    
    if (window.pendingMultiplayerRoom && window.pendingMultiplayerRoom.worldConfig) {
      const config = window.pendingMultiplayerRoom.worldConfig;
      
      // Show world configuration
      if (worldInfo) worldInfo.classList.remove('hidden');
      if (worldNameSpan) worldNameSpan.textContent = config.name;
      if (gameModeSpan) gameModeSpan.textContent = config.gameMode.charAt(0).toUpperCase() + config.gameMode.slice(1);
      if (worldTypeSpan) worldTypeSpan.textContent = config.worldType.charAt(0).toUpperCase() + config.worldType.slice(1);
      if (worldSizeSpan) worldSizeSpan.textContent = config.worldSize.charAt(0).toUpperCase() + config.worldSize.slice(1);
      
      // Hide Configure World button, show Host Room button
      if (createWorldBtn) createWorldBtn.classList.add('hidden');
      if (hostRoomBtn) hostRoomBtn.classList.remove('hidden');
      
      console.log('Showing world configuration:', config);
    } else {
      // Hide world configuration if no config exists
      if (worldInfo) worldInfo.classList.add('hidden');
      if (createWorldBtn) createWorldBtn.classList.remove('hidden');
      if (hostRoomBtn) hostRoomBtn.classList.add('hidden');
    }
  }
  
  hostMultiplayerRoom() {
    console.log('Starting to host multiplayer room...');
    
    if (!window.pendingMultiplayerRoom || !window.pendingMultiplayerRoom.worldConfig) {
      alert('No room configuration found. Please configure the world first.');
      return;
    }
    
    // Apply the world configuration and create the world
    this.applyWorldConfigAndCreate();
  }
  
  applyWorldConfigAndCreate() {
    const config = window.pendingMultiplayerRoom.worldConfig;
    
    // Set global world variables from saved config
    worldName = config.name;
    worldSeed = config.seed;
    worldGameMode = config.gameMode;
    worldType = config.worldType;
    worldSize = config.worldSize;
    
    console.log('Creating world with configuration:', config);
    
    // Create the world using existing createWorld logic
    this.createWorld().then(() => {
      console.log('Multiplayer world created successfully');
      
      // Wait for world to be fully loaded before setting up multiplayer
      const waitForWorldBlocks = () => {
        console.log('Checking world state...');
        console.log('World exists:', !!world);
        console.log('World blocks exists:', !!world?.blocks);
        console.log('World blocks length:', world?.blocks?.length);
        console.log('World width/height:', world?.width, 'x', world?.height);
        
        // Check if world has loaded chunks (the actual way this game stores world data)
        if (world && world.chunks && world.chunks.size > 0) {
          console.log('World chunks ready, setting up multiplayer hosting...');
          this.setupMultiplayerHosting(window.pendingMultiplayerRoom);
          window.pendingMultiplayerRoom = null;
        } else if (world && world.width && world.height) {
          // World exists but chunks not loaded yet
          console.log('World exists but chunks not loaded yet...');
          setTimeout(waitForWorldBlocks, 500);
        } else {
          console.log('Waiting for world to be generated...');
          setTimeout(waitForWorldBlocks, 500);
        }
      };
      
      // Start checking after a brief delay
      setTimeout(waitForWorldBlocks, 1000);
      
    }).catch(err => {
      console.error('Failed to create multiplayer world:', err);
      alert('Failed to create world for multiplayer');
    });
  }
  
  setupMultiplayerHosting(roomConfig) {
    console.log('Setting up multiplayer hosting with room config:', roomConfig);
    
    if (!window.multiplayerPeer || !window.myPeerId) {
      console.log('Multiplayer peer not ready, initializing...');
      this.initializeMultiplayerNetwork();
      
      // Wait for peer to be ready
          setTimeout(() => {
        this.setupMultiplayerHosting(roomConfig);
          }, 1000);
      return;
    }
    
    // Store room configuration
    window.hostedRoom = {
      id: `room_${Date.now()}`,
      ...roomConfig,
      peerId: window.myPeerId,
      players: 1,
      connectedPeers: [],
      worldData: this.serializeWorldData(),
      worldName: worldName,
      gameMode: worldGameMode,
      timestamp: Date.now()
    };
    
    // Register room for discovery
    this.registerRoomForDiscovery(window.hostedRoom);
    
    // Initialize multiplayer sync systems
    this.initializeMultiplayerSync();
    
    console.log('Multiplayer room is now active and accepting connections');
    alert(`Room "${roomConfig.name}" is now hosting!\nOther players can now join your room.`);
  }

  registerRoomForDiscovery(room) {
    console.log('Registering room for discovery:', room);
    
    try {
      // Get existing rooms from localStorage
      const existingRooms = JSON.parse(localStorage.getItem('hostedRooms') || '[]');
      
      // Remove any existing room with the same ID to avoid duplicates
      const filteredRooms = existingRooms.filter(existingRoom => existingRoom.id !== room.id);
      
      // Add the new room
      filteredRooms.push(room);
      
      // Store back to localStorage
      localStorage.setItem('hostedRooms', JSON.stringify(filteredRooms));
      
      console.log(`Room "${room.name}" registered for discovery. Total rooms: ${filteredRooms.length}`);
      
      // Set up periodic room refresh to keep it active
      if (room.refreshInterval) {
        clearInterval(room.refreshInterval);
      }
      
      room.refreshInterval = setInterval(() => {
        this.refreshRoomTimestamp(room.id);
      }, 5000); // Refresh every 5 seconds
      
    } catch (error) {
      console.error('Error registering room for discovery:', error);
    }
  }

  refreshRoomTimestamp(roomId) {
    try {
      const existingRooms = JSON.parse(localStorage.getItem('hostedRooms') || '[]');
      const roomIndex = existingRooms.findIndex(room => room.id === roomId);
      
      if (roomIndex !== -1) {
        existingRooms[roomIndex].timestamp = Date.now();
        localStorage.setItem('hostedRooms', JSON.stringify(existingRooms));
        console.log(`Refreshed timestamp for room ${roomId}`);
      }
    } catch (error) {
      console.error('Error refreshing room timestamp:', error);
    }
  }

  removeHostedRoom() {
    if (!window.hostedRoom) return;
    
    try {
      const existingRooms = JSON.parse(localStorage.getItem('hostedRooms') || '[]');
      const filteredRooms = existingRooms.filter(room => room.id !== window.hostedRoom.id);
      localStorage.setItem('hostedRooms', JSON.stringify(filteredRooms));
      
      // Clear refresh interval
      if (window.hostedRoom.refreshInterval) {
        clearInterval(window.hostedRoom.refreshInterval);
      }
      
      console.log(`Removed hosted room ${window.hostedRoom.id} from discovery`);
      window.hostedRoom = null;
    } catch (error) {
      console.error('Error removing hosted room:', error);
    }
  }
  

  

  

  
  startHosting() {
    console.log('Starting to host room...');
    
    // Stop room discovery when starting to host
    this.stopRoomDiscovery();
    
    const roomName = document.getElementById('roomName').value || 'My World';
    const username = document.getElementById('createRoomUsername').value || 'Player';
    const maxPlayers = this.getSelectedMaxPlayers();
    const worldType = this.getSelectedWorldType();
    const existingWorld = document.getElementById('existingWorldSelect').value;
    
    if (worldType === 'existing' && !existingWorld) {
      alert('Please select an existing world or choose "New World"');
      return;
    }
    
    console.log('Room configuration:', {
      roomName,
      username,
      maxPlayers,
      worldType,
      existingWorld
    });
    
    // Create the room
    this.createAndHostRoom({
      name: roomName,
      host: username,
      maxPlayers: maxPlayers,
      worldType: worldType,
      existingWorld: existingWorld
    });
  }
  
  getSelectedMaxPlayers() {
    const buttons = ['max-players-2', 'max-players-4', 'max-players-8'];
    for (const buttonAction of buttons) {
      const button = document.querySelector(`[data-action="${buttonAction}"]`);
      if (button && button.hasAttribute('data-selected')) {
        return parseInt(buttonAction.split('-')[2]);
      }
    }
    return 2; // Default
  }
  
  getSelectedWorldType() {
    const newWorldBtn = document.querySelector('[data-action="room-world-new"]');
    const existingWorldBtn = document.querySelector('[data-action="room-world-existing"]');
    
    if (existingWorldBtn && existingWorldBtn.hasAttribute('data-selected')) {
      return 'existing';
    }
    return 'new';
  }
  
  createAndHostRoom(roomConfig) {
    console.log('Creating and hosting room:', roomConfig);
    
    if (!window.multiplayerPeer || !window.myPeerId) {
      alert('Multiplayer not initialized. Please try again.');
      return;
    }
    
    // Store room configuration
    window.hostedRoom = {
      id: `room_${Date.now()}`,
      ...roomConfig,
      peerId: window.myPeerId,
      players: 1,
      connectedPeers: [],
      worldData: null
    };
    
    // Initialize world for multiplayer
    this.initializeMultiplayerWorld(roomConfig);
  }
  
  initializeMultiplayerWorld(roomConfig) {
    console.log('Initializing multiplayer world...');
    
    if (roomConfig.worldType === 'existing' && roomConfig.existingWorld) {
      // Load existing world
      console.log('Loading existing world:', roomConfig.existingWorld);
      // TODO: Load world from localStorage
      this.startMultiplayerGame();
    } else {
      // Create new world
      console.log('Creating new world for multiplayer');
      this.createMultiplayerWorldWithConfig(roomConfig);
    }
  }
  
  createMultiplayerWorldWithConfig(roomConfig) {
    // Use existing world creation logic but mark as multiplayer
    console.log('Creating new world for multiplayer hosting...');
    
    // Set world configuration
    worldName = roomConfig.name;
    worldGameMode = 'survival'; // Default for multiplayer
    worldType = 'regular';
    worldSize = 'normal';
    
    // Create the world using existing createWorld logic
    this.createWorld().then(() => {
      console.log('Multiplayer world created successfully');
      this.startMultiplayerGame();
      }).catch(err => {
      console.error('Failed to create multiplayer world:', err);
      alert('Failed to create world for multiplayer');
    });
  }
  
  startMultiplayerGame() {
    console.log('Starting multiplayer game as host...');
    
    // Initialize multiplayer sync systems
    this.initializeMultiplayerSync();
    
    // Hide menus and show game
    this.hideAllMenus();
    
    console.log('Multiplayer room is now active and accepting connections');
    alert(`Room "${window.hostedRoom.name}" is now hosting!\nOther players can now join your room.`);
  }
  
  initializeMultiplayerSync() {
    console.log('Initializing multiplayer synchronization...');
    
    // Store original game functions to wrap them with multiplayer sync
    window.multiplayerSync = {
      enabled: true,
      isHost: true,
      connectedPeers: [],
      worldData: this.serializeWorldData(),
      playerData: new Map()
    };
    
    // TODO: Implement data synchronization
    console.log('Multiplayer sync initialized');
  }
  
  serializeWorldData() {
    console.log('Serializing world data...');
    if (!world) {
      console.log('No world available for serialization');
      return null;
    }
    
    // This game uses chunks, not a blocks array - let's serialize the chunks
    console.log('World chunks size:', world.chunks ? world.chunks.size : 'no chunks');
    
    if (!world.chunks || world.chunks.size === 0) {
      console.log('World chunks not ready yet, returning minimal structure...');
      
      // Return a minimal world structure that clients can use
      return {
        worldName: worldName,
        seed: world.seed || 0,
        gameMode: worldGameMode,
        worldType: worldType,
        worldSize: worldSize,
        width: world.width || 2000,
        height: world.height || 200,
        chunks: {}, // Empty chunks object
        time: world.time || 0,
        weather: world.weather || 'clear',
        dayLength: world.dayLength || 24000
      };
    }
    
    // Serialize chunks to a format that can be transmitted
    const chunksData = {};
    world.chunks.forEach((chunkData, chunkKey) => {
      chunksData[chunkKey] = chunkData;
    });
    
    console.log('Serialized chunks count:', Object.keys(chunksData).length);
    
    const worldData = {
      worldName: worldName,
      seed: world.seed,
      gameMode: worldGameMode,
      worldType: worldType,
      worldSize: worldSize,
      width: world.width,
      height: world.height,
      chunks: chunksData,
      time: world.time,
      weather: world.weather || 'clear',
      dayLength: world.dayLength || 24000
    };
    
    console.log('Serialized world data:', worldData);
    console.log('World chunks count:', Object.keys(worldData.chunks).length);
    console.log('World dimensions:', `${worldData.width}x${worldData.height}`);
    
    return worldData;
  }
  
  // Handle incoming connections from other players
  handleIncomingConnection(conn) {
    console.log('Handling incoming connection from:', conn.peer);
    console.log('Connection state on host side:', conn.open);
    console.log('Connection object on host side:', conn);
    console.log('Host peer ID:', window.myPeerId);
    console.log('Host is ready:', !!window.myPeerId);
    
    // Check if connection is already open
    if (conn.open) {
      console.log('Connection is already open on host side');
      // Send immediate ping if already open
      try {
        conn.send({ 
          type: 'ping', 
          message: 'Host connection immediate',
          timestamp: Date.now() 
        });
        console.log('Sent immediate ping to already open connection');
      } catch (error) {
        console.error('Failed to send immediate ping:', error);
      }
    } else {
      console.log('Connection is not open yet, waiting for open event...');
    }
    
    // Monitor WebRTC connection state on host side
    if (conn.peerConnection) {
      console.log('Host: WebRTC peer connection found, adding state listeners');
      
      conn.peerConnection.addEventListener('connectionstatechange', () => {
        console.log('Host: WebRTC connection state changed:', conn.peerConnection.connectionState);
        
        // When WebRTC connects on host side, monitor status
        if (conn.peerConnection.connectionState === 'connected' && !conn.open) {
          console.log('Host: WebRTC connected, waiting for data channel to open...');
          // Let PeerJS handle the connection state naturally
        }
      });
      
      conn.peerConnection.addEventListener('iceconnectionstatechange', () => {
        console.log('Host: ICE connection state changed:', conn.peerConnection.iceConnectionState);
        
        // Also monitor ICE connection status on host side
        if ((conn.peerConnection.iceConnectionState === 'connected' || 
             conn.peerConnection.iceConnectionState === 'completed') && !conn.open) {
          console.log('Host: ICE connected, waiting for data channel to open...');
          // Let PeerJS handle the connection state naturally
        }
      });
      
      conn.peerConnection.addEventListener('icegatheringstatechange', () => {
        console.log('Host: ICE gathering state changed:', conn.peerConnection.iceGatheringState);
      });
    } else {
      console.log('Host: No WebRTC peer connection found yet');
      
      setTimeout(() => {
        if (conn.peerConnection) {
          console.log('Host: WebRTC peer connection found after delay');
        }
      }, 1000);
    }
    
    conn.on('open', () => {
      console.log('Incoming connection opened from:', conn.peer);
      console.log('Connection state after open event:', conn.open);
      
      // Send a welcome ping to confirm the connection is working
      try {
        conn.send({ 
          type: 'ping', 
          message: 'Host connection confirmed',
          timestamp: Date.now() 
        });
        console.log('Sent welcome ping to new connection');
      } catch (error) {
        console.error('Failed to send welcome ping:', error);
      }
    });
    
    conn.on('data', (data) => {
      console.log('Received data from incoming connection:', data);
      this.handleMultiplayerMessage(conn, data);
    });
    
    conn.on('close', () => {
      console.log('Player disconnected:', conn.peer);
      this.removePlayerFromRoom(conn.peer);
    });
    
    conn.on('error', (err) => {
      console.error('Incoming connection error:', err);
    });
    
    // Add periodic checks for connection state (workaround for PeerJS data channel issues)
    let hostConnectionChecks = 0;
    const maxHostChecks = 10;
    
    const checkHostConnection = () => {
      hostConnectionChecks++;
      console.log(`Host connection check ${hostConnectionChecks}/${maxHostChecks}: state = ${conn.open}`);
      
      if (conn.open) {
        console.log('Host connection is now open! Sending welcome ping...');
        try {
          conn.send({ 
            type: 'ping', 
            message: 'Host connection finally open',
            timestamp: Date.now() 
          });
        } catch (error) {
          console.error('Failed to send welcome ping:', error);
        }
      } else if (hostConnectionChecks < maxHostChecks) {
        // Continue checking
        setTimeout(checkHostConnection, 1000);
      } else {
        console.log('Host connection never opened after maximum attempts');
        console.log('Host WebRTC state:', conn.peerConnection?.connectionState);
        console.log('Host ICE state:', conn.peerConnection?.iceConnectionState);
      }
    };
    
    // Start checking after initial delay
    setTimeout(checkHostConnection, 2000);
  }
  
  handleMultiplayerMessage(conn, data) {
    console.log('Received multiplayer message:', data);
    
    switch (data.type) {
      case 'join_request':
        this.handleJoinRequest(conn, data);
        break;
      case 'join_accepted':
        this.handleJoinAccepted(conn, data);
        break;
      case 'join_denied':
        this.handleJoinDenied(conn, data);
        break;
      case 'ping':
        console.log('Received ping from:', conn.peer);
        conn.send({ type: 'pong', timestamp: Date.now() });
        break;
      case 'pong':
        console.log('Received pong from:', conn.peer);
        break;
      case 'player_movement':
        this.handlePlayerMovement(conn, data);
        break;
      case 'block_change':
        this.handleBlockChange(conn, data);
        break;
      case 'chat_message':
        this.handleChatMessage(conn, data);
        break;
      case 'player_disconnect':
        this.handlePlayerDisconnect(conn, data);
        break;
      case 'host_shutdown':
        this.handleHostShutdown(conn, data);
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  }
  
  handleJoinRequest(conn, data) {
    console.log('Player requesting to join:', data.username);
    console.log('Current hosted room:', window.hostedRoom);
    console.log('Host peer ID:', window.myPeerId);
    console.log('Client peer ID:', conn.peer);
    
    if (!window.hostedRoom) {
      console.log('No hosted room available, denying join');
      conn.send({ type: 'join_denied', reason: 'Room not available' });
      return;
    }
    
    if (window.hostedRoom.players >= window.hostedRoom.maxPlayers) {
      console.log('Room is full, denying join');
      conn.send({ type: 'join_denied', reason: 'Room is full' });
      return;
    }
    
    console.log('Accepting player join request');
    
    // Accept the player
    window.hostedRoom.players++;
    window.hostedRoom.connectedPeers.push({
      peerId: conn.peer,
      username: data.username,
      connection: conn
    });
    
    // Add to remote players tracking for the host
    if (!window.remotePlayers) {
      window.remotePlayers = new Map();
    }
    window.remotePlayers.set(conn.peer, {
      x: player ? player.x : 0,
      y: player ? player.y : 0,
      username: data.username
    });
    
    console.log('Sending join_accepted with world data...');
    
    // Send world data to joining player
    conn.send({
      type: 'join_accepted',
      worldData: this.serializeWorldData(),
      playerList: window.hostedRoom.connectedPeers.map(p => ({
        peerId: p.peerId,
        username: p.username
      }))
    });
    
    console.log(`Player ${data.username} joined the room successfully`);
  }
  
  handleJoinAccepted(conn, data) {
    console.log('Join request accepted! Loading multiplayer world...');
    
    // Store connection for multiplayer
    window.multiplayerConnection = conn;
    window.isMultiplayerClient = true;
    
    // Load the world data from the host
    this.loadMultiplayerWorld(data.worldData);
  }
  
  handleJoinDenied(conn, data) {
    console.log('Join request denied:', data.reason);
    alert(`Failed to join room: ${data.reason}`);
    
    // Go back to multiplayer menu
    this.showMenu('multiplayerMenu');
  }
  
  loadMultiplayerWorld(worldData) {
    console.log('Loading multiplayer world with data:', worldData);
    
    try {
      // Set global world variables from host's world
      worldName = worldData.worldName || 'Multiplayer World';
      worldSeed = worldData.seed || '';
      worldGameMode = worldData.gameMode || 'survival';
      worldType = worldData.worldType || 'regular';
      worldSize = worldData.worldSize || 'normal';
      
      // Hide all menus before creating world
      this.hideAllMenus();
      
      // Create the world with host's settings
      this.createWorld().then(() => {
        console.log('Multiplayer world loaded successfully');
        
        // Load the actual world chunks from host
        if (worldData.chunks && world) {
          console.log('Loading world chunks from host...');
          
          // Clear existing chunks
          world.chunks.clear();
          
          // Load chunks from host
          Object.keys(worldData.chunks).forEach(chunkKey => {
            world.chunks.set(chunkKey, worldData.chunks[chunkKey]);
          });
          
          console.log(`Loaded ${Object.keys(worldData.chunks).length} chunks from host`);
        }
        
        // Set player position (spawn at a safe location)
        if (player) {
          // Find a safe spawn position
          const spawnPos = this.findSafeSpawnPosition();
          player.x = spawnPos.x;
          player.y = spawnPos.y;
          console.log('Player spawned at:', spawnPos);
        }
        
        // Initialize multiplayer client sync
        this.initializeMultiplayerClientSync();
        
        console.log('Multiplayer world fully loaded and ready!');
        
      }).catch(err => {
        console.error('Failed to load multiplayer world:', err);
        alert('Failed to load multiplayer world');
        this.showMenu('multiplayerMenu');
      });
      
    } catch (error) {
      console.error('Error loading multiplayer world:', error);
      alert('Failed to load multiplayer world');
      this.showMenu('multiplayerMenu');
    }
  }
  
  findSafeSpawnPosition() {
    // Find a safe spawn position (not inside blocks)
    const centerX = Math.floor(world.width / 2);
    const centerY = Math.floor(world.height / 2);
    
    // Start from center and search for air
    for (let y = centerY; y < world.height - 10; y++) {
      for (let x = centerX - 10; x < centerX + 10; x++) {
        if (x >= 0 && x < world.width && y >= 0 && y < world.height) {
          const index = y * world.width + x;
          if (world.blocks[index] === 0) { // Air block
            return { x: x * TILE_SIZE, y: y * TILE_SIZE };
          }
        }
      }
    }
    
    // Fallback to center
    return { x: centerX * TILE_SIZE, y: centerY * TILE_SIZE };
  }
  
  initializeMultiplayerClientSync() {
    console.log('Initializing multiplayer client synchronization...');
    
    // Initialize remote players tracking
    if (!window.remotePlayers) {
      window.remotePlayers = new Map();
    }
    
    // Set up periodic position updates
    if (!window.multiplayerPositionInterval) {
      window.multiplayerPositionInterval = setInterval(() => {
        if (player && window.multiplayerConnection && window.multiplayerConnection.open) {
          try {
            window.multiplayerConnection.send({
              type: 'player_movement',
              position: { x: player.x, y: player.y },
              timestamp: Date.now()
            });
          } catch (error) {
            console.error('Failed to send player movement:', error);
          }
        }
      }, 100); // Send position every 100ms
    }
    
    // Set up message handling for client
    if (window.multiplayerConnection) {
      window.multiplayerConnection.on('data', (data) => {
        this.handleMultiplayerClientMessage(data);
      });
    }
    
    console.log('Multiplayer client sync initialized');
  }
  
  handleMultiplayerClientMessage(data) {
    console.log('Client received message:', data);
    
    switch (data.type) {
      case 'player_movement':
        // Update remote player position
        if (window.remotePlayers && data.peerId !== window.myPeerId) {
          if (!window.remotePlayers.has(data.peerId)) {
            window.remotePlayers.set(data.peerId, {
              x: data.position.x,
              y: data.position.y,
              username: data.username || 'Remote Player'
            });
          } else {
            const remotePlayer = window.remotePlayers.get(data.peerId);
            remotePlayer.x = data.position.x;
            remotePlayer.y = data.position.y;
            // Update username if provided
            if (data.username) {
              remotePlayer.username = data.username;
            }
          }
        }
        break;
      case 'block_change':
        // Apply block change to local world
        if (world && data.x >= 0 && data.x < world.width && data.y >= 0 && data.y < world.height) {
          const index = data.y * world.width + data.x;
          
          // Handle both numeric and string block IDs
          let blockType = data.blockType;
          if (data.blockId) {
            blockType = menuManager.getBlockNumericId(data.blockId);
          }
          
          world.blocks[index] = blockType;
          
          // Apply metadata if provided
          if (data.meta && world.blockMeta) {
            world.blockMeta.set(index, data.meta);
          }
          
          console.log(`Applied block change: (${data.x}, ${data.y}) -> ${blockType} (${data.blockId || 'unknown'})`);
        }
        break;
      case 'chat_message':
        // Handle chat message display
        console.log(`Chat from ${data.username}: ${data.message}`);
        break;
      case 'player_disconnect':
        // Remove disconnected player from remote players
        if (window.remotePlayers && window.remotePlayers.has(data.peerId)) {
          window.remotePlayers.delete(data.peerId);
          console.log(`Player ${data.username} disconnected`);
        }
        break;
      case 'host_shutdown':
        // Host is shutting down
        console.log('Host is shutting down:', data.message);
        this.cleanupMultiplayerClient();
        alert('Host has shut down the server');
        this.returnToMainMenu();
        break;
      default:
        console.log('Unknown client message type:', data.type);
    }
  }
  

  

  
  removePlayerFromRoom(peerId) {
    if (!window.hostedRoom) return;
    
    const index = window.hostedRoom.connectedPeers.findIndex(p => p.peerId === peerId);
    if (index !== -1) {
      const player = window.hostedRoom.connectedPeers[index];
      window.hostedRoom.connectedPeers.splice(index, 1);
      window.hostedRoom.players--;
      console.log(`Player ${player.username} left the room`);
      
      // Remove from remote players tracking
      if (window.remotePlayers && window.remotePlayers.has(peerId)) {
        window.remotePlayers.delete(peerId);
        console.log(`Removed remote player ${peerId} from tracking`);
      }
      
      // Notify other players about disconnection
      this.broadcastToAll({
        type: 'player_disconnect',
        peerId: peerId,
        username: player.username,
        timestamp: Date.now()
      });
    }
  }
  
  handlePlayerMovement(conn, data) {
    // Update remote player position if we have a system for tracking remote players
    if (window.remotePlayers) {
      if (!window.remotePlayers.has(conn.peer)) {
        // Find username from connected peers
        let username = 'Remote Player';
        if (window.hostedRoom && window.hostedRoom.connectedPeers) {
          const peer = window.hostedRoom.connectedPeers.find(p => p.peerId === conn.peer);
          if (peer) username = peer.username;
        }
        
        window.remotePlayers.set(conn.peer, {
          x: data.position.x,
          y: data.position.y,
          username: username
        });
      } else {
        const remotePlayer = window.remotePlayers.get(conn.peer);
        remotePlayer.x = data.position.x;
        remotePlayer.y = data.position.y;
      }
    }
    
    // Broadcast player movement to all other connected players
    // Find username for the moving player
    let username = 'Remote Player';
    if (window.hostedRoom && window.hostedRoom.connectedPeers) {
      const peer = window.hostedRoom.connectedPeers.find(p => p.peerId === conn.peer);
      if (peer) username = peer.username;
    }
    
    this.broadcastToAllExcept(conn.peer, {
      type: 'player_movement',
      peerId: conn.peer,
      position: data.position,
      username: username,
      timestamp: Date.now()
    });
  }
  
  handleBlockChange(conn, data) {
    // Apply block change to world and broadcast to all players
    if (world && data.x >= 0 && data.x < world.width && data.y >= 0 && data.y < world.height) {
      const index = data.y * world.width + data.x;
      
      // Handle both numeric and string block IDs
      let blockType = data.blockType;
      if (data.blockId) {
        // If we have a string ID, use it to get the proper numeric ID
        blockType = this.getBlockNumericId(data.blockId);
      }
      
      world.blocks[index] = blockType;
      
      // Apply metadata if provided
      if (data.meta && world.blockMeta) {
        world.blockMeta.set(index, data.meta);
      }
      
      console.log(`Applied block change from ${conn.peer}: (${data.x}, ${data.y}) -> ${blockType}`);
      
      // Broadcast to all other players (not the sender)
      this.broadcastToAllExcept(conn.peer, {
        type: 'block_change',
        x: data.x,
        y: data.y,
        blockType: blockType,
        blockId: data.blockId,
        meta: data.meta,
        timestamp: Date.now()
      });
    }
  }
  
  handleChatMessage(conn, data) {
    // Broadcast chat message to all players
    this.broadcastToAll({
      type: 'chat_message',
      username: data.username,
      message: data.message,
      timestamp: Date.now()
    });
  }
  
  handlePlayerDisconnect(conn, data) {
    console.log(`Received player disconnect notification: ${data.username}`);
    // This is just a notification, actual cleanup happens in connection close event
  }
  
  handleHostShutdown(conn, data) {
    console.log('Received host shutdown notification:', data.message);
    // This is handled in the client message handler
  }
  
  broadcastToAll(message) {
    if (!window.hostedRoom) return;
    
    window.hostedRoom.connectedPeers.forEach(peer => {
      if (peer.connection && peer.connection.open) {
        peer.connection.send(message);
      }
    });
  }
  
  broadcastToAllExcept(excludePeerId, message) {
    if (!window.hostedRoom) return;
    
    window.hostedRoom.connectedPeers.forEach(peer => {
      if (peer.peerId !== excludePeerId && peer.connection && peer.connection.open) {
        try {
          peer.connection.send(message);
        } catch (error) {
          console.error('Failed to send message to peer:', peer.peerId, error);
        }
      }
    });
  }
  
  // Multiplayer sync functions for block changes
  syncBlockChange(x, y, blockId, meta = null) {
    console.log(`Syncing block change: (${x}, ${y}) -> ${blockId}`);
    
    // Convert block ID to numeric ID for transmission
    const blockType = this.getBlockNumericId(blockId);
    
    if (window.hostedRoom) {
      // Host: broadcast to all clients
      this.broadcastToAll({
        type: 'block_change',
        x: x,
        y: y,
        blockType: blockType,
        blockId: blockId,
        meta: meta,
        timestamp: Date.now()
      });
    } else if (window.multiplayerConnection && window.multiplayerConnection.open) {
      // Client: send to host
      try {
        window.multiplayerConnection.send({
          type: 'block_change',
          x: x,
          y: y,
          blockType: blockType,
          blockId: blockId,
          meta: meta,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Failed to sync block change:', error);
      }
    }
  }
  
  getBlockNumericId(blockId) {
    // Convert block ID to numeric ID
    if (!blockId || blockId === 'air') return 0;
    
    // Get the block from registry
    const block = registry.get(blockId);
    if (block && typeof block.id === 'number') {
      return block.id;
    }
    
    // Fallback: try to find the block by iterating
    for (const [id, blockData] of registry.map.entries()) {
      if (blockData.id === blockId) {
        return registry.getNumericId(blockId);
      }
    }
    
    return 0; // Default to air
  }
  
  // Cleanup functions for multiplayer
  cleanupMultiplayerClient() {
    console.log('Cleaning up multiplayer client state...');
    
    // Clear intervals
    if (window.multiplayerPositionInterval) {
      clearInterval(window.multiplayerPositionInterval);
      window.multiplayerPositionInterval = null;
    }
    
    // Clear remote players
    if (window.remotePlayers) {
      window.remotePlayers.clear();
    }
    
    // Reset multiplayer flags
    window.isMultiplayerClient = false;
    window.multiplayerConnection = null;
    
    console.log('Multiplayer client cleanup completed');
  }
  
  cleanupMultiplayerHost() {
    console.log('Cleaning up multiplayer host state...');
    
    // Disconnect all connected players
    if (window.hostedRoom && window.hostedRoom.connectedPeers) {
      window.hostedRoom.connectedPeers.forEach(peer => {
        if (peer.connection && peer.connection.open) {
          try {
            peer.connection.send({
              type: 'host_shutdown',
              message: 'Host is shutting down',
              timestamp: Date.now()
            });
            peer.connection.close();
          } catch (error) {
            console.error('Error notifying peer of shutdown:', error);
          }
        }
      });
    }
    
    // Clear hosted room
    window.hostedRoom = null;
    
    // Clear remote players
    if (window.remotePlayers) {
      window.remotePlayers.clear();
    }
    
    console.log('Multiplayer host cleanup completed');
  }
  
  // Attempt to manually trigger data channel opening (workaround for PeerJS issues)
  attemptDataChannelOpen(conn) {
    console.log('Attempting to manually open data channel...');
    
    try {
      // Check if there are any data channels in the peer connection
      if (conn.peerConnection && conn.peerConnection.sctp) {
        console.log('SCTP transport found, attempting to nudge...');
      }
      
      // Try to access the internal data channel
      if (conn.dataChannel) {
        console.log('Data channel found:', conn.dataChannel);
        console.log('Data channel state:', conn.dataChannel.readyState);
        
        if (conn.dataChannel.readyState === 'connecting') {
          console.log('Data channel is connecting, waiting...');
          
          // Add listeners if not already added
          if (!conn.dataChannel.onopen) {
            conn.dataChannel.onopen = () => {
              console.log('Manual data channel opened!');
              // PeerJS will handle setting conn.open automatically
              
              // Trigger the open event manually if needed
              if (conn._events && conn._events.open && !conn.open) {
                setTimeout(() => {
                  if (!conn.open) {
                conn.emit('open');
                  }
                }, 100);
              }
            };
          }
        }
      }
      
      // Try sending a ping to trigger the connection
      setTimeout(() => {
        if (!conn.open && conn.send) {
          try {
            console.log('Attempting ping to trigger connection...');
            conn.send({ type: 'ping', test: true });
          } catch (e) {
            console.log('Ping failed, connection not ready yet');
          }
        }
      }, 500);
      
    } catch (error) {
      console.error('Error in manual data channel open attempt:', error);
    }
  }
  
  // Aggressive reconnection as last resort
  attemptAggressiveReconnection(peerId, username) {
    console.log('Attempting aggressive reconnection to:', peerId);
    
    // Destroy current peer and create fresh one
    if (window.multiplayerPeer) {
      try {
        window.multiplayerPeer.destroy();
      } catch (e) {
        console.error('Error destroying peer:', e);
      }
      window.multiplayerPeer = null;
      window.myPeerId = null;
    }
    
    // Wait a moment and reinitialize
    setTimeout(() => {
      console.log('Reinitializing multiplayer network for aggressive reconnection...');
      this.initializeMultiplayerNetwork();
      
      // Wait for peer to be ready and try connection again
      setTimeout(() => {
        if (window.multiplayerPeer && window.myPeerId) {
          console.log('Retrying connection after peer reset...');
          this.joinRoom('room_' + Date.now(), peerId); // Use a new room ID to avoid caching issues
        } else {
          alert('Failed to reconnect. Please refresh the page and try again.');
          this.showMenu('multiplayerMenu');
        }
      }, 3000);
    }, 1000);
  }

  initializeKeybindButtons() {
    // Reset temp keybinds to current saved keybinds
    tempKeybinds = { ...keybinds };
    
    // Update all keybind buttons with current values
    Object.keys(keybinds).forEach(action => {
      const button = document.querySelector(`[data-action="bind-${action}"]`);
      if (button) {
        button.textContent = this.getKeyDisplayName(keybinds[action]);
        button.setAttribute('data-key', keybinds[action]);
        button.classList.remove('modified'); // Remove any previous modified state
      }
    });
  }
}

// Initialize menu manager
const menuManager = new MenuManager();
window.menuManager = menuManager;

// Import bee config
const BEE_CONFIG = {
  groupRadius: 20
};



const REACH_TILES = 5;
let CHUNK_RENDER_DISTANCE = 4;

canvas = document.getElementById('gameCanvas');
ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = Math.floor(window.devicePixelRatio * canvas.clientWidth);
  canvas.height = Math.floor(window.devicePixelRatio * canvas.clientHeight);
}
function ensureCSSSize() {
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
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

// Initialize basic renderer for menu backgrounds
if (canvas && ctx) {
  // Create a basic renderer for menus (without world/player dependencies)
  renderer = new Renderer(
    ctx, canvas, null, registry, camera, input, null, null, null,
    () => ({
      backgroundBlocks,
      menuPatterns: null
    }),
    null
  );
  
  // Make background blocks available globally
  window.backgroundBlocks = backgroundBlocks;
  
  // Preload textures for menu backgrounds
  renderer.preloadTextures();
  
  // Make renderer globally accessible
  window.renderer = renderer;
  
  console.log('Basic renderer initialized for menus');
  
  // Start basic rendering for menus
  if (!window.engine || typeof window.engine.start !== 'function') {
    // Create a simple render loop for menus
    function menuRenderLoop() {
      try {
        if (window.renderer && typeof window.renderer.render === 'function') {
          window.renderer.render();
        }
      } catch (renderError) {
        console.error('Render error in menu loop:', renderError);
      }
      requestAnimationFrame(menuRenderLoop);
    }
    menuRenderLoop();
    console.log('Menu render loop started');
  }
}

// Initialize mod manager
modManager = new ModManager();
window.modManager = modManager;

// Load background configuration
loadBackgroundConfig();

// Make backgroundBlocks globally accessible for renderer
window.backgroundBlocks = backgroundBlocks;

// World will be created when user clicks "Create World"

// Chat history system
let chatHistory = [];
let chatHistoryIndex = -1; // -1 means no history selected

// Command autocomplete system
const availableCommands = [
  { cmd: 'give', usage: 'give <item> [amount]', needsItem: true },
  { cmd: 'giveall', usage: 'giveall <category>', needsCategory: true },
  { cmd: 'clear', usage: 'clear' },
  { cmd: 'mode', usage: 'mode <s|survival|c|creative>' },
  { cmd: 'time', usage: 'time <value> or time <HH:MM>' },
  { cmd: 'giverandom', usage: 'giverandom [count]' },
  { cmd: 'setpos1', usage: 'setpos1' },
  { cmd: 'setpos2', usage: 'setpos2' },
  { cmd: 'setposclear', usage: 'setposclear' },
  { cmd: 'fill', usage: 'fill <block> [type] [replaceBlock]', needsBlock: true },
  { cmd: 'tick', usage: 'tick <speed>' },
  { cmd: 'tp', usage: 'tp <x> <y>' },
  { cmd: 'seed', usage: 'seed [newSeed]' },
  { cmd: 'itemconfig', usage: 'itemconfig [setting] [value]' },
  { cmd: 'lighting', usage: 'lighting [recalc]' },
  

];

const itemCategories = {
  tools: ['wooden_sword', 'wooden_pickaxe', 'wooden_shovel', 'wooden_axe', 'trowel', 'copper_sword', 'copper_pickaxe', 'copper_shovel', 'copper_axe', 'iron_sword', 'iron_pickaxe', 'iron_shovel', 'iron_axe', 'iron_hatchet', 'gold_sword', 'gold_pickaxe', 'gold_shovel', 'gold_axe', 'diamond_sword', 'diamond_pickaxe', 'diamond_shovel', 'diamond_axe'],
  woods: ['oak_log', 'birch_log', 'spruce_log', 'maple_log'],
  planks: ['oak_planks', 'birch_planks', 'spruce_planks', 'maple_planks'],
  leaves: ['oak_leaves', 'birch_leaves', 'spruce_leaves', 'maple_green_leaves', 'maple_orange_leaves', 'maple_red_leaves'],
  dirt: ['dirt', 'grass', 'sand', 'mud', 'coarse_dirt', 'gravel']
};

let commandSuggestions = [];
let selectedSuggestionIndex = -1;
let itemSuggestions = [];
let selectedItemIndex = -1;
let currentCommand = null;
let currentArgIndex = 0;

// Function to draw position outlines
function drawPositionOutlines(ctx, camera) {
  const outlineColor1 = '#00ff00'; // Green for position 1
  const outlineColor2 = '#ff0000'; // Red for position 2
  const outlineWidth = 2;
  
  if (setPosition1) {
    const sx = Math.round(camera.worldToScreenX(setPosition1.x * TILE_SIZE));
    const sy = Math.round(camera.worldToScreenY(setPosition1.y * TILE_SIZE));
    const size = Math.round(TILE_SIZE * camera.zoom);
    
    ctx.save();
    ctx.strokeStyle = outlineColor1;
    ctx.lineWidth = outlineWidth;
    ctx.strokeRect(sx, sy, size, size);
    ctx.restore();
  }
  
  if (setPosition2) {
    const sx = Math.round(camera.worldToScreenX(setPosition2.x * TILE_SIZE));
    const sy = Math.round(camera.worldToScreenY(setPosition2.y * TILE_SIZE));
    const size = Math.round(TILE_SIZE * camera.zoom);
    
    ctx.save();
    ctx.strokeStyle = outlineColor2;
    ctx.lineWidth = outlineWidth;
    ctx.strokeRect(sx, sy, size, size);
    ctx.restore();
  }
}

function restoreSavedEntities(chunkX) {
  try {
    if (!world || typeof world.fetchSavedEntitiesForChunk !== 'function') return;
    const saved = world.fetchSavedEntitiesForChunk(chunkX);
    if (!saved || !saved.length) return;
    for (const s of saved) {
      const it = new ItemEntity(s.blockId, s.x, s.y, world.time);
      it.vx = s.vx ?? 0;
      it.vy = s.vy ?? 0;
      it.life = s.life ?? 0;
      it.age = s.age ?? 0;
      items.push(it);
    }
  } catch (err) {
  }
}

function findSurfaceY(tileX) {
  console.log('findSurfaceY called for tileX:', tileX);
  const seed = world.seed ?? currentSeed ?? 0;
  console.log('Using seed:', seed);
  
  for (let y = 0; y < world.height; y++) {
    const sampled = sampleBlockAt(tileX, y, seed, world.height, world.width, world.worldType || 'regular', world.superflatLayers || null);
    if (!sampled) continue;
    
    if (sampled.id === 'grass' || sampled.id === 'sand') {
      console.log('Found surface at Y:', y, 'block:', sampled.id);
      return y;
    }
  }
  
  const fallbackY = Math.floor(world.height / 2);
  console.log('No surface found, using fallback Y:', fallbackY);
  return fallbackY;
}

function findDropY(xPixel, yPixel) {
  const tileX = Math.floor(xPixel / TILE_SIZE);
  let tileY = Math.floor(yPixel / TILE_SIZE);

  if (!world.inBounds(tileX, tileY)) {
    tileY = Math.max(0, Math.min(world.height - 1, tileY));
  }

  const currentType = world.getBlockType(tileX, tileY);
  if (currentType && currentType.solid) {
    while (tileY > 0) {
      const checkType = world.getBlockType(tileX, tileY - 1);
      if (!checkType || !checkType.solid) break;
      tileY--;
    }
  }

  while (tileY < world.height - 1) {
    const belowType = world.getBlockType(tileX, tileY + 1);
    if (belowType && belowType.solid) break;
    tileY++;
  }

  return (tileY + 0.5) * TILE_SIZE;
}

function fillArea(x1, y1, x2, y2, blockId, fillType = 'solid', replaceBlock = null) {
  // Ensure coordinates are in bounds
  x1 = Math.max(0, Math.min(world.width - 1, x1));
  y1 = Math.max(0, Math.min(world.height - 1, y1));
  x2 = Math.max(0, Math.min(world.width - 1, x2));
  y2 = Math.max(0, Math.min(world.height - 1, y2));
  
  // Swap coordinates if needed
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
          // Only place blocks on the edges
          shouldPlace = (x === minX || x === maxX || y === minY || y === maxY);
          break;
          
        case 'replace':
          // Only replace if the current block matches the replace block
          const currentBlock = world.getBlockId(x, y);
          shouldPlace = (currentBlock === replaceBlock);
          break;
          
        default:
          shouldPlace = true;
          break;
      }
      
      if (shouldPlace) {
        world.setBlock(x, y, blockId, null);
        world.updateLighting(x, y);
        
        // Sync command block changes in multiplayer
        if (window.hostedRoom || window.multiplayerConnection) {
          menuManager.syncBlockChange(x, y, blockId, null);
        }
      }
    }
  }
}

const spawnTileX = 100;
const spawnX = TILE_SIZE * spawnTileX;
// Player will be initialized when world is created

// Add loading state

function computeSeededSpawn(originX = spawnTileX) {
  console.log('=== SPAWN CALCULATION START ===');
  console.log('computeSeededSpawn called with originX:', originX);
  
  // Ensure player exists before computing spawn
  if (!player) {
    console.error('computeSeededSpawn called before player is created');
    return;
  }
  
  console.log('Player exists, current position:', { x: player.x, y: player.y });
  console.log('Player tile position:', { 
    tileX: Math.floor(player.x / TILE_SIZE), 
    tileY: Math.floor(player.y / TILE_SIZE) 
  });
  console.log('World bounds:', { width: world.width, height: world.height });
  
  const searchRadiusX = 8;
  const searchRadiusY = 12;
  console.log('Search radius:', { x: searchRadiusX, y: searchRadiusY });

  const playerTilesWide = Math.max(1, Math.ceil(player.width / TILE_SIZE));
  const attempts = [];

  const tryFits = (leftColumn, tileY) => {
    const headTileY = tileY;
    const footTileY = tileY + Math.ceil(player.height / TILE_SIZE) - 1;

    attempts.push({ leftColumn, tileY, headTileY, footTileY, result: 'checking' });

    for (let tx = leftColumn; tx < leftColumn + playerTilesWide; tx++) {
      if (!world.inBounds(tx, headTileY) || !world.inBounds(tx, footTileY)) {
        attempts[attempts.length - 1].result = 'out_of_bounds';
        return false;
      }
      for (let ty = headTileY; ty <= footTileY; ty++) {
        const bt = world.getBlockType(tx, ty);
        if (bt && bt.solid) {
          attempts[attempts.length - 1].result = 'body_solid';
          return false;
        }
      }
    }
    let hasSolidGround = false;
    for (let tx = leftColumn; tx < leftColumn + playerTilesWide; tx++) {
      const below = world.inBounds(tx, footTileY + 1) ? world.getBlockType(tx, footTileY + 1) : null;
      if (below && below.solid) {
        hasSolidGround = true;
        break;
      }
    }
    if (hasSolidGround) {
      attempts[attempts.length - 1].result = 'ok_on_solid';
      return true;
    }
    attempts[attempts.length - 1].result = 'no_ground';
    return false;
  };

  console.log('Starting spawn search...');
  for (let ox = 0; ox <= searchRadiusX; ox++) {
    console.log('Searching at offset:', ox);
    for (const sx of [originX + ox, originX - ox]) {
      console.log('Checking spawn X:', sx);
      if (sx < 0 || sx >= world.width) {
        console.log('X out of bounds:', sx);
        continue;
      }
      const surface = findSurfaceY(sx);
      console.log('Surface Y for X', sx, ':', surface);
      for (let dy = 0; dy <= searchRadiusY; dy++) {
        const up = surface - 2 - dy;
        if (up >= 0) {
          for (let hx = 0; hx < Math.max(1, playerTilesWide); hx++) {
            const leftCol = sx - hx;
            if (leftCol < 0 || leftCol + playerTilesWide - 1 >= world.width) continue;
            if (tryFits(leftCol, up)) {
              const newX = leftCol * TILE_SIZE;
              const newY = up * TILE_SIZE;
              console.log('FOUND VALID SPAWN!');
              console.log('Setting player to:', { x: newX, y: newY });
              console.log('Tile position:', { tileX: leftCol, tileY: up });
              player.x = newX;
              player.y = newY;
              player.vx = 0; player.vy = 0; player.onGround = false;
              console.log('=== SPAWN CALCULATION SUCCESS ===');
              return true;
            }
          }
        }
        const down = surface - 2 + dy;
        if (down <= world.height - 3) {
          for (let hx = 0; hx < Math.max(1, playerTilesWide); hx++) {
            const leftCol = sx - hx;
            if (leftCol < 0 || leftCol + playerTilesWide - 1 >= world.width) continue;
            if (tryFits(leftCol, down)) {
              player.x = leftCol * TILE_SIZE;
              player.y = down * TILE_SIZE;
              player.vx = 0; player.vy = 0; player.onGround = false;
              return true;
            }
          }
        }
      }
    }
  }

  console.log('No ideal spawn found, using fallback...');
  const surface = findSurfaceY(originX);
  console.log('Fallback surface Y:', surface);
  let candidateY = (surface - 2) * TILE_SIZE;
  console.log('Fallback spawn position:', { 
    x: originX * TILE_SIZE, 
    y: candidateY,
    tileX: originX,
    tileY: surface - 2
  });
  player.x = originX * TILE_SIZE;
  player.y = candidateY;
  player.vx = 0; player.vy = 0; player.onGround = false;

  console.log('Starting fallback nudge loop...');
  for (let i = 0; i < 80; i++) {
    const headTileY = Math.floor(player.y / TILE_SIZE);
    const footTileY = Math.floor((player.y + player.height) / TILE_SIZE);
    console.log('Nudge iteration', i, 'player at Y:', player.y, 'tile Y:', headTileY);
    
    let bad = false;
    for (let tx = Math.floor(player.x / TILE_SIZE); tx <= Math.floor((player.x + player.width - 1) / TILE_SIZE); tx++) {
      if (!world.inBounds(tx, headTileY) || !world.inBounds(tx, footTileY)) { 
        console.log('Out of bounds at TX:', tx, 'headY:', headTileY, 'footY:', footTileY);
        bad = true; 
        attempts.push({ leftColumn: Math.floor(player.x / TILE_SIZE), tileY: headTileY, result: 'oob' }); 
        break; 
      }
      const ht = world.getBlockType(tx, headTileY);
      const ft = world.getBlockType(tx, footTileY);
      if ((ht && ht.solid) || (ft && ft.solid)) { 
        console.log('Collision at TX:', tx, 'head block:', ht?.id, 'foot block:', ft?.id);
        bad = true; 
        attempts.push({ leftColumn: Math.floor(player.x / TILE_SIZE), tileY: headTileY, result: 'conflict' }); 
        break; 
      }
    }
    if (!bad) {
      console.log('Found safe position after', i, 'nudges at Y:', player.y);
      console.log('=== SPAWN CALCULATION COMPLETE ===');
      return true;
    }
    player.y -= TILE_SIZE;
    player.vy = 0;
  }

  console.error('Could not find safe spawn after 80 nudges! Final position:', { x: player.x, y: player.y });
  console.log('=== SPAWN CALCULATION FAILED ===');
  return false;
}

async function loadInitialChunks(originX) {
  console.log('Loading initial chunks for originX:', originX);
  const centerChunk = Math.floor(originX / Math.max(1, world.chunkSize));
  const dist = Math.max(0, Math.floor(CHUNK_RENDER_DISTANCE));
  const minChunk = Math.max(0, centerChunk - dist);
  const maxChunk = Math.min(Math.floor((world.width - 1) / Math.max(1, world.chunkSize)), centerChunk + dist);

  console.log('Chunk range:', minChunk, 'to', maxChunk, 'center:', centerChunk);

  const chunksToLoad = [];
  for (let cx = minChunk; cx <= maxChunk; cx++) {
    chunksToLoad.push(cx);
  }
  chunksToLoad.sort((a, b) => Math.abs(a - centerChunk) - Math.abs(b - centerChunk));

  console.log('Chunks to load:', chunksToLoad);

  // Load chunks in parallel with priority for center chunks
  const loadPromises = chunksToLoad.map((cx, index) => {
    // Add a small delay for non-center chunks to prioritize center
    const delay = index > 2 ? (index - 2) * 10 : 0;
    
    return new Promise(resolve => {
      setTimeout(() => {
        console.log('Loading chunk:', cx);
        world.loadChunkAsync(cx).then(chunk => {
          console.log('Chunk loaded:', cx, chunk ? 'success' : 'failed');
          if (chunk) {
            restoreSavedEntities(cx);
          }
          resolve(chunk);
        }).catch(err => {
          console.error('Error loading chunk:', cx, err);
          resolve(null);
        });
      }, delay);
    });
  });

  console.log('Waiting for all chunks to load...');
  await Promise.all(loadPromises);
  console.log('All chunks loaded');
}

function ensurePlayerNotInSolid() {
  console.log('=== ENSURING PLAYER NOT IN SOLID ===');
  // Ensure player exists before checking
  if (!player) {
    console.error('ensurePlayerNotInSolid called before player is created');
    return;
  }
  
  console.log('Player current position before nudge:', { x: player.x, y: player.y });
  console.log('Player tile position before nudge:', { 
    tileX: Math.floor(player.x / TILE_SIZE), 
    tileY: Math.floor(player.y / TILE_SIZE) 
  });
  
  const maxNudge = 40;
  console.log('Max nudge iterations:', maxNudge);
  for (let i = 0; i < maxNudge; i++) {
    const left = Math.floor(player.x / TILE_SIZE);
    const right = Math.floor((player.x + player.width - 1) / TILE_SIZE);
    const footTileY = Math.floor((player.y + player.height) / TILE_SIZE);
    const headTileY = Math.floor(player.y / TILE_SIZE);
    let footSolid = false;
    let headSolid = false;
    for (let tx = left; tx <= right; tx++) {
      if (world.inBounds(tx, footTileY)) {
        const bt = world.getBlockType(tx, footTileY);
        if (bt && bt.solid) footSolid = true;
      }
      if (world.inBounds(tx, headTileY)) {
        const ht = world.getBlockType(tx, headTileY);
        if (ht && ht.solid) headSolid = true;
      }
    }
    if (!footSolid && !headSolid) return;
    player.y -= TILE_SIZE;
    player.vy = 0;
  }
}


class Inventory {
  constructor(registry) {
    this.registry = registry;
    this.HOTBAR_SIZE = 9;
    this.TOTAL_SLOTS = 64;
    this.maxStack = 64;
    this.slots = Array.from({ length: this.TOTAL_SLOTS }, () => null);
  }
  
  getSlot(i) { 
    return this.slots[i]; 
  }
  
  setSlot(i, stack) { 
    this.slots[i] = stack; 
  }
  
  takeSlot(i) { 
    const s = this.slots[i]; 
    this.slots[i] = null; 
    return s; 
  }
  
  canMerge(a, b) {
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.type === 'block') return a.blockId === b.blockId;
    if (a.type === 'item') return a.itemId === b.itemId;
    return false;
  }
  
  addBlock(blockId, count = 1) {
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.type === 'block' && s.blockId === blockId && s.count < (s.maxStack ?? 64)) {
        const room = (s.maxStack ?? 64) - s.count;
        const take = Math.min(room, count);
        s.count += take;
        count -= take;
      }
    }
    
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(64, count);
        const block = this.registry.get(blockId);
        this.slots[i] = { 
          type: 'block', 
          blockId, 
          displayName: block?.displayName || blockId, 
          count: take, 
          maxStack: block?.maxStack ?? 64 
        };
        count -= take;
      }
    }
    
    return count;
  }
  
  addItem(itemId, count = 1) {
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.type === 'item' && s.itemId === itemId && s.count < (s.maxStack ?? 64)) {
        const room = (s.maxStack ?? 64) - s.count;
        const take = Math.min(room, count);
        s.count += take;
        count -= take;
      }
    }
    
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(64, count);
        this.slots[i] = { 
          type: 'item', 
          itemId, 
          displayName: itemId === 'stick' ? 'Stick' : itemId, 
          count: take, 
          maxStack: 64 
        };
        count -= take;
      }
    }
    
    return count;
  }

  hasSpaceForBlock(blockId, count = 1) {
    let remaining = count;
    
    // Check existing stacks first
    for (let i = 0; i < this.TOTAL_SLOTS && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.type === 'block' && s.blockId === blockId && s.count < (s.maxStack ?? 64)) {
        const room = (s.maxStack ?? 64) - s.count;
        const take = Math.min(room, remaining);
        remaining -= take;
      }
    }
    
    // Check empty slots
    for (let i = 0; i < this.TOTAL_SLOTS && remaining > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(64, remaining);
        remaining -= take;
      }
    }
    
    return remaining === 0;
  }

  hasSpaceForItem(itemId, count = 1) {
    let remaining = count;
    
    // Check existing stacks first
    for (let i = 0; i < this.TOTAL_SLOTS && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.type === 'item' && s.itemId === itemId && s.count < (s.maxStack ?? 64)) {
        const room = (s.maxStack ?? 64) - s.count;
        const take = Math.min(room, remaining);
        remaining -= take;
      }
    }
    
    // Check empty slots
    for (let i = 0; i < this.TOTAL_SLOTS && remaining > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(64, remaining);
        remaining -= take;
      }
    }
    
    return remaining === 0;
  }
  
  getAllBlocks() {
    const blocks = [];
    for (const [id, block] of this.registry.entries()) {
      if (id !== 'air') {
        blocks.push({
          type: 'block',
          blockId: id,
          displayName: block.displayName || id,
          count: 1,
          maxStack: block.maxStack ?? 64
        });
      }
    }
    return blocks;
  }

  getCreativeCategories() {
    const categories = {
      'building': { name: 'Building', items: [] },
      'nature': { name: 'Nature', items: [] },
      'tools': { name: 'Tools', items: [] },
      'materials': { name: 'Materials', items: [] },
      'functional': { name: 'Functional', items: [] }
    };

    // Categorize blocks
    for (const [id, block] of this.registry.entries()) {
      if (id === 'air') continue;
      
      const item = {
        type: 'block',
        blockId: id,
        displayName: block.displayName || id,
        count: 1,
        maxStack: block.maxStack ?? 64
      };

      // Building blocks
      if (id.includes('planks') || id.includes('stairs') || id.includes('slab') || 
          id === 'stone' || id === 'glass' || id === 'bedrock') {
        categories.building.items.push(item);
      }
      // Nature blocks
      else if (id.includes('leaves') || id.includes('log') || id.includes('grass') || 
               id.includes('dirt') || id.includes('sand') || id.includes('gravel') || 
               id.includes('water') || id.includes('fern') || id.includes('flower') || 
               id.includes('poppy') || id === 'mud') {
        categories.nature.items.push(item);
      }
      // Functional blocks
      else if (id === 'chest' || id === 'crafting_table' || id === 'furnace' || 
               id === 'torch' || id === 'trapdoor') {
        categories.functional.items.push(item);
      }
      // Materials (ores and ingots)
      else if (id.includes('ore') || id.includes('copper') || id.includes('coal')) {
        categories.materials.items.push(item);
      }
      // Default to building
      else {
        categories.building.items.push(item);
      }
    }

    // Add items to tools category
    const toolItems = ['wooden', 'copper', 'iron', 'gold', 'diamond'];
    const toolTypes = ['axe', 'pickaxe', 'shovel', 'sword'];
    
    for (const material of toolItems) {
      for (const type of toolTypes) {
        const itemId = `${material}_${type}`;
        categories.tools.items.push({
          type: 'item',
          itemId: itemId,
          displayName: `${material.charAt(0).toUpperCase() + material.slice(1)} ${type.charAt(0).toUpperCase() + type.slice(1)}`,
          count: 1,
          maxStack: 1
        });
      }
    }

    // Add other items
    const otherItems = ['stick', 'trowel', 'apple', 'coal', 'diamond', 'iron_ingot', 'gold_ingot'];
    for (const itemId of otherItems) {
      categories.materials.items.push({
        type: 'item',
        itemId: itemId,
        displayName: itemId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        count: 1,
        maxStack: 64
      });
    }

    return categories;
  }
  
  removeItems(type, id, count) {
    let remaining = count;
    
    for (let i = 0; i < this.TOTAL_SLOTS && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.type === type && 
          ((type === 'block' && s.blockId === id) || (type === 'item' && s.itemId === id))) {
        const take = Math.min(s.count, remaining);
        s.count -= take;
        remaining -= take;
        
        if (s.count <= 0) {
          this.slots[i] = null;
        }
      }
    }
    
    return remaining;
  }
}

// Initialize UI state variables first
let inventoryOpen = false;
let selectedIndex = 0;
let noClipMode = false;
let creativeTab = 'building';
let creativeScrollY = 0;
let textInputMode = false;
let textInputValue = '';
let showOutline = true;
let backgroundBuild = false;
let gamePaused = false;
let pauseMenuState = 'main'; // 'main', 'options'
let pauseMenuHover = -1; // Track which button is being hovered


inventory = new Inventory(registry);

// Player starts with empty inventory

// Player position will be initialized when world is created
// World loading will be triggered when user creates a world

function mergeSameToSlot(targetIndex) {
  const target = inventory.getSlot(targetIndex);
  if (!target || target.type !== 'block') return false;
  const maxStack = target.maxStack ?? 64;
  let moved = false;

  // First fill target from other stacks
  for (let i = 0; i < inventory.TOTAL_SLOTS; i++) {
    if (i === targetIndex) continue;
    const s = inventory.getSlot(i);
    if (!s) continue;
    if (!inventory.canMerge(target, s)) continue;
    const room = maxStack - (target.count ?? 0);
    if (room <= 0) break;
    const take = Math.min(room, s.count);
    target.count = (target.count ?? 0) + take;
    s.count -= take;
    moved = moved || take > 0;
    if (s.count <= 0) inventory.setSlot(i, null);
  }

  // In case target somehow exceeded maxStack (safety), push overflow to first empty slots
  if (target.count > maxStack) {
    let overflow = target.count - maxStack;
    target.count = maxStack;
    for (let i = 0; i < inventory.TOTAL_SLOTS && overflow > 0; i++) {
      if (i === targetIndex) continue;
      const s = inventory.getSlot(i);
      if (!s) {
        const put = Math.min(overflow, maxStack);
        inventory.setSlot(i, { type: 'block', blockId: target.blockId, displayName: target.displayName, count: put, maxStack });
        overflow -= put;
        moved = true;
      } else if (inventory.canMerge(target, s) && s.count < (s.maxStack ?? maxStack)) {
        const room = (s.maxStack ?? maxStack) - s.count;
        const put = Math.min(room, overflow);
        s.count += put;
        overflow -= put;
        moved = moved || put > 0;
      }
    }
  }

  inventory.setSlot(targetIndex, target);
  if (moved) recomputeCraft();
  return moved;
}

function throwSelectedBlock() {
  const hotSlot = inventory.getSlot(selectedIndex);
  if (!hotSlot) return;

  const mouseWorldX = camera.screenToWorldX(input.mouse.x);
  const mouseWorldY = camera.screenToWorldY(input.mouse.y);
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  const dx = mouseWorldX - playerCenterX;
  const dy = mouseWorldY - playerCenterY;
  const dist = Math.hypot(dx, dy);

  let nx = 0, ny = -1;
  if (dist > 0.001) {
    nx = dx / dist;
    ny = dy / dist;
  }

  const spawnOffset = Math.max(TILE_SIZE * 0.9, player.width * 1.1);
  let spawnX = playerCenterX + nx * spawnOffset;
  let spawnY = playerCenterY + ny * spawnOffset;

  for (let i = 0; i < 6; i++) {
    const tx = Math.floor(spawnX / TILE_SIZE);
    const ty = Math.floor(spawnY / TILE_SIZE);
    if (!world.inBounds(tx, ty)) break;
    const bt = world.getBlockType(tx, ty);
    if (!bt || !bt.solid) break;
    spawnY -= TILE_SIZE * 0.25;
  }

  const speed = 8;
  const vx = nx * speed;
  const vy = ny * speed;

  // Create item entity based on type
  let itemId = null;
  if (hotSlot.type === 'block') {
    itemId = hotSlot.blockId;
  } else if (hotSlot.type === 'item') {
    itemId = hotSlot.itemId;
  }

  const dropped = new ItemEntity(itemId, spawnX, spawnY, world.time);
  dropped.vx = vx;
  dropped.vy = vy;
  dropped.mass = 1;

  items.push(dropped);

  hotSlot.count -= 1;
  if (hotSlot.count <= 0) inventory.setSlot(selectedIndex, null);
}

let lastClickTime = 0;
let lastClickSlot = -1;

let isDraggingLeftClick = false;
let lastDragSlot = -1;

      // Fill command state
      let fillPos1 = null;
      let fillPos2 = null;
      
      if (typeof window !== 'undefined') {
        window.textInputMode = textInputMode;
      }
      


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
  
  if (!textInputValue.startsWith('/')) return;
  
  const parts = textInputValue.slice(1).split(' ');
  const commandPart = parts[0].toLowerCase();
  
  if (parts.length === 1) {
    // Still typing the command
    if (commandPart.length === 0) {
      // Show all commands when just "/" is typed
      commandSuggestions = [...availableCommands];
    } else {
      // Filter commands based on input
      commandSuggestions = availableCommands.filter(cmd => 
        cmd.cmd.toLowerCase().startsWith(commandPart) ||
        cmd.cmd.toLowerCase().includes(commandPart)
      );
    }
    
    // Limit to 8 suggestions for display
    commandSuggestions = commandSuggestions.slice(0, 8);
  } else {
    // Command is complete, now suggesting arguments
    const command = availableCommands.find(cmd => cmd.cmd === commandPart);
    if (command) {
      currentCommand = command;
      currentArgIndex = parts.length - 2; // -2 because parts[0] is command, parts[1] is first arg
      
      // Always show the current command in suggestions for reference
      commandSuggestions = [command];
      
      if (command.needsItem && currentArgIndex === 0) {
        // Suggest items/blocks for give command
        const allItems = [];
        
        // Add blocks
        for (const [id, block] of registry.entries()) {
          if (id !== 'air') {
            allItems.push({ id, type: 'block', displayName: block.displayName || id });
          }
        }
        
        // Add items
        const itemIds = ['stick', 'apple', 'wooden_shovel', 'wooden_pickaxe', 'wooden_axe', 'wooden_sword', 'trowel',
                        'copper_pickaxe', 'copper_axe', 'copper_shovel', 'copper_sword',
                        'iron_pickaxe', 'iron_axe', 'iron_shovel', 'iron_sword', 'iron_hatchet',
                        'gold_pickaxe', 'gold_axe', 'gold_shovel', 'gold_sword',
                        'diamond_pickaxe', 'diamond_axe', 'diamond_shovel', 'diamond_axe',
                        'coal', 'iron_ingot', 'gold_ingot', 'diamond'];
        
        for (const itemId of itemIds) {
          allItems.push({ id: itemId, type: 'item', displayName: itemId === 'stick' ? 'Stick' : itemId });
        }
        
        const currentArg = parts[1].toLowerCase();
        itemSuggestions = allItems.filter(item => 
          item.id.toLowerCase().startsWith(currentArg) ||
          item.displayName.toLowerCase().includes(currentArg)
        );
        
        itemSuggestions = itemSuggestions.slice(0, 10);
      } else if (command.needsCategory && currentArgIndex === 0) {
        // Suggest categories for giveall command
        const currentArg = parts[1].toLowerCase();
        itemSuggestions = Object.keys(itemCategories).filter(category => 
          category.toLowerCase().startsWith(currentArg)
        ).map(category => ({ id: category, type: 'category', displayName: category }));
      } else if (command.needsBlock && currentArgIndex === 0) {
        // Suggest blocks for fill command
        const currentArg = parts[1].toLowerCase();
        const allBlocks = [];
        
        for (const [id, block] of registry.entries()) {
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
      // Command not found, show all commands
      commandSuggestions = availableCommands.filter(cmd => 
        cmd.cmd.toLowerCase().startsWith(commandPart) ||
        cmd.cmd.toLowerCase().includes(commandPart)
      ).slice(0, 8);
    }
  }
}

function processTextInputCommand(command) {
  if (!command.trim()) return;

  const trimmed = command.trim();
  if (trimmed.startsWith('/')) {
    const parts = trimmed.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    


    if (cmd === 'give') {
      const id = parts[1];
      const amount = parts.length > 2 ? parseInt(parts[2], 10) : 1;
      if (!id) { return; }
      if (isNaN(amount) || amount <= 0) { return; }

      const block = registry.get(id);
      if (block) {
        const leftover = inventory.addBlock(id, amount);
      } else {
        if (id === 'stick' || id === 'apple' || id === 'wooden_shovel' || id === 'trowel' ||
            id === 'wooden_pickaxe' || id === 'wooden_axe' || id === 'wooden_sword' ||
            id === 'copper_pickaxe' || id === 'copper_axe' || id === 'copper_shovel' || id === 'copper_sword' ||
            id === 'iron_pickaxe' || id === 'iron_axe' || id === 'iron_shovel' || id === 'iron_sword' ||
            id === 'iron_hatchet' ||
            id === 'gold_pickaxe' || id === 'gold_axe' || id === 'gold_shovel' || id === 'gold_sword' ||
            id === 'diamond_pickaxe' || id === 'diamond_axe' || id === 'diamond_shovel' || id === 'diamond_axe') {
          const leftover = inventory.addItem(id, amount);
        }
      }
      return;
    }

    if (cmd === 'giveall') {
      const subcommand = parts[1];
      if (!subcommand) {
        return;
      }
      
      switch (subcommand.toLowerCase()) {
        case 'tools':
          // Give all tools from wooden to gold tier
          const tools = [
            'wooden_sword', 'wooden_pickaxe', 'wooden_shovel', 'wooden_axe', 'trowel',
            'copper_sword', 'copper_pickaxe', 'copper_shovel', 'copper_axe',
            'iron_sword', 'iron_pickaxe', 'iron_shovel', 'iron_axe',
            'gold_sword', 'gold_pickaxe', 'gold_shovel', 'gold_axe'
          ];
          
          for (const tool of tools) {
            inventory.addItem(tool, 1);
          }
          break;
          
        case 'woods':
          // Give all wood types
          const woods = ['oak_log', 'birch_log', 'spruce_log', 'maple_log'];
          for (const wood of woods) {
            inventory.addBlock(wood, 64);
          }
          break;
          
        case 'planks':
          // Give all plank types
          const planks = ['oak_planks', 'birch_planks', 'spruce_planks', 'maple_planks'];
          for (const plank of planks) {
            inventory.addBlock(plank, 64);
          }
          break;
          
        case 'leaves':
          // Give all leaf types
          const leaves = ['oak_leaves', 'birch_leaves', 'spruce_leaves', 'maple_green_leaves', 'maple_orange_leaves', 'maple_red_leaves'];
          for (const leaf of leaves) {
            inventory.addBlock(leaf, 64);
          }
          break;
          
        case 'dirt':
          // Give all dirt types
          const dirts = ['dirt', 'grass', 'sand', 'mud', 'coarse_dirt', 'gravel'];
          for (const dirt of dirts) {
            inventory.addBlock(dirt, 64);
          }
          break;
          
        default:
          // Unknown subcommand
          break;
      }
      return;
    }

    if (cmd === 'clear') {
      // Clear all inventory slots
      for (let i = 0; i < inventory.slots.length; i++) {
        inventory.setSlot(i, null);
      }
      return;
    }

    if (cmd === 'mode') {
      const mode = parts[1];
      if (!mode) {
        return;
      }
      
      const modeStr = mode.toLowerCase();
      if (modeStr === 's' || modeStr === 'survival') {
        // Switch to survival mode
        creativeMode = false;
        world.creativeMode = false;
        
        // Reset flight if flying
        if (player.creativeFlying) {
          player.creativeFlying = false;
        }
        
        // Close creative inventory if open
        if (inventoryOpen) {
          inventoryOpen = false;
        }
        
        return;
      } else if (modeStr === 'c' || modeStr === 'creative') {
        // Switch to creative mode
        creativeMode = true;
        world.creativeMode = true;
        
        return;
      }
      
      // Invalid mode
      return;
    }

    if (cmd === 'time') {
      const timeValue = parts[1];
      if (!timeValue) {
        console.log('Usage: /time <value> or /time <HH:MM> or /time auto');
        console.log('Examples: /time 0.5 (noon), /time 0.25 (sunrise), /time 12:30, /time auto (automatic time)');
        return;
      }
      
      if (timeValue === 'auto') {
        world.timeManuallySet = false;
        console.log('Time set to automatic mode');
        return;
      }
      

      
      let time;
      
      // Check if it's a time format (HH:MM)
      if (timeValue.includes(':')) {
        const timeParts = timeValue.split(':');
        if (timeParts.length === 2) {
          const hours = parseInt(timeParts[0]);
          const minutes = parseInt(timeParts[1]);
          
          if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            console.log('Invalid time format. Use HH:MM (e.g., 12:30)');
            return;
          }
          
          // Convert to 0-1 range (24 hour format)
          time = (hours + minutes / 60) / 24;
        } else {
          console.log('Invalid time format. Use HH:MM (e.g., 12:30)');
          return;
        }
      } else {
        // Parse as decimal (0-1 where 0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset)
        time = parseFloat(timeValue);
        if (isNaN(time) || time < 0 || time > 1) {
          console.log('Invalid time value. Use 0-1 (e.g., 0.5 for noon) or HH:MM format');
          return;
        }
      }
      
      // Set world time (multiply by day length to get actual time)
      world.time = time * world.dayLength;
      world.timeManuallySet = true; // Flag that time was manually set
      
      // Convert back to readable format for confirmation
      const hours = Math.floor(time * 24);
      const minutes = Math.floor((time * 24 - hours) * 60);
      const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      
      console.log(`Time set to: ${timeString} (${timeValue})`);
      return;
    }

    if (cmd === 'giverandom') {
      const count = parts[1] ? parseInt(parts[1]) : 1;
      if (isNaN(count) || count <= 0 || count > 100) {
        return;
      }
      
      // Get all available blocks and items
      const allItems = [];
      
      // Add blocks
      for (const [id, block] of registry.entries()) {
        allItems.push({ id, type: 'block' });
      }
      
      // Add items
      const itemIds = ['stick', 'apple', 'wooden_shovel', 'wooden_pickaxe', 'wooden_axe', 'wooden_sword', 'trowel',
                      'copper_pickaxe', 'copper_axe', 'copper_shovel', 'copper_sword',
                      'iron_pickaxe', 'iron_axe', 'iron_shovel', 'iron_sword', 'iron_hatchet',
                      'gold_pickaxe', 'gold_axe', 'gold_shovel', 'gold_sword',
                      'diamond_pickaxe', 'diamond_axe', 'diamond_shovel', 'diamond_axe'];
      
      for (const itemId of itemIds) {
        allItems.push({ id: itemId, type: 'item' });
      }
      
      // Give random items
      for (let i = 0; i < count; i++) {
        const randomItem = allItems[Math.floor(Math.random() * allItems.length)];
        let leftover = 0;
        
        if (randomItem.type === 'block') {
          leftover = inventory.addBlock(randomItem.id, 1);
        } else {
          leftover = inventory.addItem(randomItem.id, 1);
        }
        
        // If there's leftover, spit it out as a new item entity
        if (leftover > 0) {
          const playerCenterX = player.x + player.width / 2;
          const playerCenterY = player.y + player.height / 2;
          const dropped = new ItemEntity(
            randomItem.id, 
            playerCenterX, 
            playerCenterY, 
            world.time
          );
          dropped.count = leftover;
          items.push(dropped);
        }
      }
      return;
    }

    if (cmd === 'setpos1') {
      // Set the first position for fill command (bottom of player)
      const x = Math.floor(player.x / TILE_SIZE);
      const y = Math.floor((player.y + player.height) / TILE_SIZE);
      setPosition1 = { x, y };
      return;
    }

    if (cmd === 'setpos2') {
      // Set the second position for fill command (bottom of player)
      const x = Math.floor(player.x / TILE_SIZE);
      const y = Math.floor((player.y + player.height) / TILE_SIZE);
      setPosition2 = { x, y };
      return;
    }

    if (cmd === 'setposclear') {
      // Clear all set positions
      setPosition1 = null;
      setPosition2 = null;
      return;
    }

    if (cmd === 'fill') {
      const blockId = parts[1];
      if (!blockId) {
        return;
      }

      let x1, y1, x2, y2;
      let fillType = 'solid'; // solid, hollow, replace
      let replaceBlock = null;

      // Helper function to parse coordinates with ~ support
      function parseCoord(coord, defaultValue) {
        if (coord === '~') return defaultValue;
        const parsed = parseInt(coord);
        return isNaN(parsed) ? defaultValue : parsed;
      }

      // Check if we have coordinates (4 numbers or ~)
      if (parts.length >= 5) {
        // Format: /fill x1 y1 x2 y2 block [type] [replaceBlock]
        const playerX = Math.floor(player.x / TILE_SIZE);
        const playerY = Math.floor(player.y / TILE_SIZE);
        
        x1 = parseCoord(parts[1], playerX);
        y1 = parseCoord(parts[2], playerY);
        x2 = parseCoord(parts[3], playerX);
        y2 = parseCoord(parts[4], playerY);
        
        const actualBlockId = parts[5];
        if (!actualBlockId) {
          return;
        }
        
        // Check for fill type
        if (parts[6] === 'hollow') {
          fillType = 'hollow';
        } else if (parts[6] === 'replace' && parts[7]) {
          fillType = 'replace';
          replaceBlock = parts[7];
        }
        
        // Use the actual block ID
        if (!registry.get(actualBlockId)) {
          return;
        }
        
        // Fill the area
        fillArea(x1, y1, x2, y2, actualBlockId, fillType, replaceBlock);
        
      } else if (setPosition1 && setPosition2) {
        // Format: /fill block [type] [replaceBlock] (uses both set positions)
        x1 = Math.min(setPosition1.x, setPosition2.x);
        y1 = Math.min(setPosition1.y, setPosition2.y);
        x2 = Math.max(setPosition1.x, setPosition2.x);
        y2 = Math.max(setPosition1.y, setPosition2.y);
        
        // Check for fill type
        if (parts[2] === 'hollow') {
          fillType = 'hollow';
        } else if (parts[2] === 'replace' && parts[3]) {
          fillType = 'replace';
          replaceBlock = parts[3];
        }
        
        // Fill the area
        fillArea(x1, y1, x2, y2, blockId, fillType, replaceBlock);
        
      } else if (setPosition1) {
        // Format: /fill block [type] [replaceBlock] (uses setpos1 and player position)
        const playerX = Math.floor(player.x / TILE_SIZE);
        const playerY = Math.floor(player.y / TILE_SIZE);
        
        x1 = Math.min(setPosition1.x, playerX);
        y1 = Math.min(setPosition1.y, playerY);
        x2 = Math.max(setPosition1.x, playerX);
        y2 = Math.max(setPosition1.y, playerY);
        
        // Check for fill type
        if (parts[2] === 'hollow') {
          fillType = 'hollow';
        } else if (parts[2] === 'replace' && parts[3]) {
          fillType = 'replace';
          replaceBlock = parts[3];
        }
        
        // Fill the area
        fillArea(x1, y1, x2, y2, blockId, fillType, replaceBlock);
        
      } else {
        // No setpos, can't fill
        return;
      }
      return;
    }

    if (cmd === 'tick') {
      const val = parts.length > 1 ? parseFloat(parts[1]) : NaN;
      if (isNaN(val) || val <= 0) {
        return;
      }
      gameSpeed = val;
      return;
    }

    if (cmd === 'tp') {
      // Helper function to parse coordinates with ~ support
      function parseCoord(coord, defaultValue) {
        if (coord === '~') return defaultValue;
        const parsed = Number(coord);
        return Number.isNaN(parsed) ? defaultValue : parsed;
      }
      
      const playerX = Math.floor(player.x / TILE_SIZE);
      const playerY = Math.floor(player.y / TILE_SIZE);
      
      const tx = parts.length > 1 ? parseCoord(parts[1], playerX) : playerX;
      const ty = parts.length > 2 ? parseCoord(parts[2], playerY) : playerY;
      
      player.x = tx * TILE_SIZE;
      player.y = ty * TILE_SIZE;
      player.vx = 0;
      player.vy = 0;
      player.onGround = false;
      // Ensure teleport doesn't place player inside solid blocks
      ensurePlayerNotInSolid();
      return;
    }

    if (cmd === 'seed') {
    if (parts.length > 1) {
        const newSeed = parseInt(parts[1], 10);
        if (isNaN(newSeed)) {
          return;
        }
        currentSeed = newSeed;
        world.seed = currentSeed;
        world.chunks.clear();
        world.loadedChunkOrder.length = 0;
        const spawnTileX = 100;
        setTimeout(async () => {
          computeSeededSpawn(spawnTileX);
          await loadInitialChunks(spawnTileX);
          
          // Initialize lighting for new world
          setTimeout(() => {
            try {
              console.log('Initializing lighting for new seed...');
              world.initializeLighting();
              console.log('Lighting initialization complete for new seed');
            } catch (e) {
              console.error('Lighting initialization error for new seed:', e);
            }
          }, 100);
          
          ensurePlayerNotInSolid();
        }, 0);
      }
      return;
    }

    if (cmd === 'itemconfig') {
      if (parts.length === 1) {
        // Display current configuration
        const config = ItemEntity.getConfig();
        return;
      }
      
      if (parts.length === 3) {
        const setting = parts[1];
        const value = parseFloat(parts[2]);
        if (isNaN(value)) {
          return;
        }
        
        const config = ItemEntity.getConfig();
        const newConfig = { ...config };
        
        switch (setting.toLowerCase()) {
          case 'pickuprange':
            newConfig.pickupRange = value;
            break;
          case 'attractionrange':
            newConfig.attractionRange = value;
            break;
          case 'attractionforce':
            newConfig.attractionForce = value;
            break;
          case 'pickupdelay':
            newConfig.pickupDelay = Math.max(0, Math.floor(value));
            break;
          case 'gravity':
            newConfig.gravity = value;
            break;
          case 'maxlife':
            newConfig.maxLife = Math.max(0, Math.floor(value));
            break;
          default:
            return;
        }
        
        ItemEntity.updateConfig(newConfig);
        return;
      }
      
      return;
    }





    if (cmd === 'lighting') {
      const subcommand = parts[1];
      if (subcommand === 'recalc') {
        // Recalculate lighting for the current area using chunks
        const centerX = Math.floor(player.x / TILE_SIZE);
        const centerChunk = Math.floor(centerX / world.chunkSize);
        const radius = 3; // Recalculate nearby chunks
        console.log('Recalculating lighting...');
        world.initializeLighting();
        console.log('Lighting recalculated');
        return;
      } else if (subcommand === 'debug') {
        // Show lighting values around player
        const playerX = Math.floor(player.x / TILE_SIZE);
        const playerY = Math.floor(player.y / TILE_SIZE);
        console.log(`Player position: (${playerX}, ${playerY})`);
        for (let y = playerY - 2; y <= playerY + 2; y++) {
          for (let x = playerX - 2; x <= playerX + 2; x++) {
            if (world.inBounds(x, y)) {
              const light = world.getLight(x, y);
              const blockId = world.getBlockId(x, y);
              console.log(`(${x}, ${y}): light=${light}, block=${blockId}`);
            }
          }
        }
        return;
      } else if (subcommand === 'test') {
        // Test torch placement and lighting
        const playerX = Math.floor(player.x / TILE_SIZE);
        const playerY = Math.floor(player.y / TILE_SIZE);
        console.log('Testing torch placement...');
        
        // Place a torch at player position
        world.setBlock(playerX, playerY, 'torch', null);
        world.updateLighting(playerX, playerY);
        
        // Sync torch placement in multiplayer
        if (window.hostedRoom || window.multiplayerConnection) {
          menuManager.syncBlockChange(playerX, playerY, 'torch', null);
        }
        
        // Check lighting around torch
        for (let y = playerY - 1; y <= playerY + 1; y++) {
          for (let x = playerX - 1; x <= playerX + 1; x++) {
            if (world.inBounds(x, y)) {
              const light = world.getLight(x, y);
              const blockId = world.getBlockId(x, y);
              console.log(`(${x}, ${y}): light=${light}, block=${blockId}`);
            }
          }
        }
        return;
      } else if (subcommand === 'torch') {
        // Force torch lighting test
        console.log('Forcing torch lighting test...');
        
        // Find all torches in loaded chunks
        let torchCount = 0;
        for (const chunkEntry of world.chunks.values()) {
          if (!chunkEntry || !chunkEntry.cells) continue;
          
          const chunkX = chunkEntry.chunkX;
          const startX = chunkX * world.chunkSize;
          const endX = startX + world.chunkSize;
          
          for (let y = 0; y < world.height; y++) {
            for (let x = startX; x < endX; x++) {
              const blockId = world.getBlockId(x, y);
              if (blockId === 'torch') {
                torchCount++;
                console.log(`Found torch at (${x}, ${y})`);
                const light = world.getLight(x, y);
                console.log(`Torch light level: ${light}`);
              }
            }
          }
        }
        
        console.log(`Total torches found: ${torchCount}`);
        
        // Force lighting recalculation
        // Calculate sky light first
        world.calculateSkyLight();
        
        // Then calculate block light sources - this will override sky light where needed
        world.calculateBlockLight();
        
        console.log('Lighting recalculated. Check torch areas now.');
        return;
      }
      console.log('Usage: /lighting recalc, /lighting debug, /lighting test, or /lighting torch');
      return;
    }
    
    if (cmd === 'fill') {
      if (parts.length === 6) {
        // /fill x1 y1 x2 y2 blockId
        const x1 = parseInt(parts[1], 10);
        const y1 = parseInt(parts[2], 10);
        const x2 = parseInt(parts[3], 10);
        const y2 = parseInt(parts[4], 10);
        const blockId = parts[5];
        
        if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
          console.log("Invalid coordinates");
          return;
        }
        
        const block = registry.get(blockId);
        if (!block) {
          console.log(`Unknown block: ${blockId}`);
          return;
        }
        
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        
        let blocksPlaced = 0;
        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            if (world.inBounds(x, y)) {
              world.setBlock(x, y, blockId, null);
              world.updateLighting(x, y);
              
              // Sync fill command block changes in multiplayer
              if (window.hostedRoom || window.multiplayerConnection) {
                menuManager.syncBlockChange(x, y, blockId, null);
              }
              
              blocksPlaced++;
            }
          }
        }
        console.log(`Filled ${blocksPlaced} blocks with ${blockId}`);
        return;
      } else {
        console.log("Usage: /fill x1 y1 x2 y2 blockId");
        return;
      }
    }
    
    if (cmd === 'fill1') {
      const playerTileX = Math.floor((player.x + player.width / 2) / TILE_SIZE);
      const playerTileY = Math.floor((player.y + player.height / 2) / TILE_SIZE);
      fillPos1 = { x: playerTileX, y: playerTileY };
      console.log(`Fill position 1 set to (${playerTileX}, ${playerTileY})`);
      return;
    }
    
    if (cmd === 'fill2') {
      if (parts.length < 2) {
        console.log("Usage: /fill2 blockId");
        return;
      }
      
      if (!fillPos1) {
        console.log("Use /fill1 first to set the first position");
        return;
      }
      
      const playerTileX = Math.floor((player.x + player.width / 2) / TILE_SIZE);
      const playerTileY = Math.floor((player.y + player.height / 2) / TILE_SIZE);
      fillPos2 = { x: playerTileX, y: playerTileY };
      
      const blockId = parts[1];
      const block = registry.get(blockId);
      if (!block) {
        console.log(`Unknown block: ${blockId}`);
        return;
      }
      
      const minX = Math.min(fillPos1.x, fillPos2.x);
      const maxX = Math.max(fillPos1.x, fillPos2.x);
      const minY = Math.min(fillPos1.y, fillPos2.y);
      const maxY = Math.max(fillPos1.y, fillPos2.y);
      
      let blocksPlaced = 0;
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          if (world.inBounds(x, y)) {
            world.setBlock(x, y, blockId, null);
            world.updateLighting(x, y);
            
            // Sync sphere fill command block changes in multiplayer
            if (window.hostedRoom || window.multiplayerConnection) {
              menuManager.syncBlockChange(x, y, blockId, null);
            }
            
            blocksPlaced++;
          }
        }
      }
      console.log(`Filled ${blocksPlaced} blocks with ${blockId} from (${fillPos1.x}, ${fillPos1.y}) to (${fillPos2.x}, ${fillPos2.y})`);
      
      // Reset positions
      fillPos1 = null;
      fillPos2 = null;
      return;
    }
    


    return;
  }

  const parts = trimmed.split(' ');
  const blockId = parts[0];
  const count = parts.length > 1 ? parseInt(parts[1]) : 1;

  if (isNaN(count) || count <= 0) {
    return;
  }

  const block = registry.get(blockId);
  if (block) {
    const leftover = inventory.addBlock(blockId, count);
  } else {
    if (blockId === 'stick' || blockId === 'apple' || blockId === 'wooden_spoon') {
      const leftover = inventory.addItem(blockId, count);
    }
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

function tileCenterWorld(tileX, tileY) {
  return { x: (tileX + 0.5) * TILE_SIZE, y: (tileY + 0.5) * TILE_SIZE };
}
function distance(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
function isExposed(world, x, y) {
  const neighbors = [
    [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
  ];
  for (const [nx, ny] of neighbors) {
    if (!world.inBounds(nx, ny)) continue;
    const t = world.getBlockType(nx, ny);
    if (!t || !t.solid) return true;
  }
  return false;
}
function hasLineOfSight(world, from, toWorld, targetTileX, targetTileY) {
  const dx = toWorld.x - from.x;
  const dy = toWorld.y - from.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (TILE_SIZE * 0.25)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = from.x + dx * t;
    const py = from.y + dy * t;
    const tx = Math.floor(px / TILE_SIZE);
    const ty = Math.floor(py / TILE_SIZE);
    if (tx === targetTileX && ty === targetTileY) return true;
    const bt = world.getBlockType(tx, ty);
    if (bt && bt.solid) return false;
  }
  return true;
}
function canReachTile(tileX, tileY) {
  const head = player.getHeadAnchor();
  const center = tileCenterWorld(tileX, tileY);
  if (distance(head, center) > REACH_TILES * TILE_SIZE) return false;
  return hasLineOfSight(world, head, center, tileX, tileY);
}
function getMouseTileFromRaw(screenX, screenY) {
  const worldX = camera.screenToWorldX(screenX);
  const worldY = camera.screenToWorldY(screenY);
  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);
  return { worldX, worldY, tileX, tileY };
}
function getMouseTileFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const screenX = (e.clientX - rect.left) * window.devicePixelRatio;
  const screenY = (e.clientY - rect.top) * window.devicePixelRatio;
  return { screenX, screenY, ...getMouseTileFromRaw(screenX, screenY) };
}



function handleCreateWorldMainMenuClick(screenX, screenY, dpr, canvas) {
  // Calculate button positions based on the new layout
  const fieldWidth = 300 * dpr;
  const fieldHeight = 40 * dpr;
  const fieldSpacing = 25 * dpr;
  const fieldX = Math.floor((canvas.width - fieldWidth) / 2);
  let fieldY = canvas.height * 0.25;
  
  // World Name field (clickable)
  if (screenX >= fieldX && screenX <= fieldX + fieldWidth &&
      screenY >= fieldY && screenY <= fieldY + fieldHeight) {
    // TODO: Enter text input mode for world name

    return;
  }
  
  fieldY += fieldHeight + fieldSpacing;
  
  // Seed field (clickable)
  if (screenX >= fieldX && screenX <= fieldX + fieldWidth &&
      screenY >= fieldY && screenY <= fieldY + fieldHeight) {
    // TODO: Enter text input mode for seed

    return;
  }
  
  fieldY += fieldHeight + fieldSpacing;
  
  // World Type buttons
  const optionWidth = 150 * dpr;
  const optionHeight = 35 * dpr;
  const optionSpacing = 15 * dpr;
  const optionX = Math.floor((canvas.width - optionWidth * 3 - optionSpacing * 2) / 2);
  
  // Regular button
  if (screenX >= optionX && screenX <= optionX + optionWidth &&
      screenY >= fieldY && screenY <= fieldY + optionHeight) {
    worldType = 'regular';
    return;
  }
  
  // Superflat button
  if (screenX >= optionX + optionWidth + optionSpacing && screenX <= optionX + optionWidth * 2 + optionSpacing &&
      screenY >= fieldY && screenY <= fieldY + optionHeight) {
    worldType = 'superflat';
    return;
  }
  
  // Mountains button
  if (screenX >= optionX + (optionWidth + optionSpacing) * 2 && screenX <= optionX + optionWidth * 3 + optionSpacing * 2 &&
      screenY >= fieldY && screenY <= fieldY + optionHeight) {
    worldType = 'mountains';
    return;
  }
  
  fieldY += optionHeight + fieldSpacing;
  
  // Game Mode buttons
  // Survival button
  if (screenX >= optionX && screenX <= optionX + optionWidth &&
      screenY >= fieldY && screenY <= fieldY + optionHeight) {
    worldGameMode = 'survival';
    return;
  }
  
  // Creative button
  if (screenX >= optionX + optionWidth + optionSpacing && screenX <= optionX + optionWidth * 2 + optionSpacing &&
      screenY >= fieldY && screenY <= fieldY + optionHeight) {
    worldGameMode = 'creative';
    return;
  }
  
  fieldY += optionHeight + fieldSpacing;
  
  // Checkboxes
  const checkboxSize = 20 * dpr;
  const checkboxX = Math.floor((canvas.width - 200 * dpr) / 2);
  
  // Cheats checkbox
  if (screenX >= checkboxX && screenX <= checkboxX + checkboxSize &&
      screenY >= fieldY && screenY <= fieldY + checkboxSize) {
    worldCheatsEnabled = !worldCheatsEnabled;
    return;
  }
  
  // Allow Commands checkbox
  if (screenX >= checkboxX + 200 * dpr && screenX <= checkboxX + 200 * dpr + checkboxSize &&
      screenY >= fieldY && screenY <= fieldY + checkboxSize) {
    worldAllowCommands = !worldAllowCommands;
    return;
  }
  
  fieldY += checkboxSize + fieldSpacing;
  
  // Bottom buttons
  const buttonWidth = 120 * dpr;
  const buttonHeight = 40 * dpr;
  const buttonSpacing = 20 * dpr;
  const buttonY = fieldY + 20 * dpr;
  
  const createX = Math.floor((canvas.width - buttonWidth * 3 - buttonSpacing * 2) / 2);
  
  // Create button
  if (screenX >= createX && screenX <= createX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    createWorld();
    return;
  }
  
  // Options button
  const optionsX = createX + buttonWidth + buttonSpacing;
  if (screenX >= optionsX && screenX <= optionsX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    createWorldSubMenu = 'advanced';
    return;
  }
  
  // Back button
  const backX = advancedX + buttonWidth + buttonSpacing;
  if (screenX >= backX && screenX <= backX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    // Back button - old menu system removed
    return;
  }
}

function handleSuperflatEditorClick(screenX, screenY, dpr, canvas) {
  // Layer list
  const layerWidth = 400 * dpr;
  const layerHeight = 50 * dpr;
  const layerSpacing = 10 * dpr;
  const layerX = Math.floor((canvas.width - layerWidth) / 2);
  let layerY = canvas.height * 0.35;
  
  // Check layer clicks
  for (let i = 0; i < worldSuperflatLayers.length; i++) {
    if (screenX >= layerX && screenX <= layerX + layerWidth &&
        screenY >= layerY && screenY <= layerY + layerHeight) {
      selectedSuperflatLayer = i;
      return;
    }
    layerY += layerHeight + layerSpacing;
  }
  
  // Layer controls
  const controlWidth = 100 * dpr;
  const controlHeight = 35 * dpr;
  const controlSpacing = 15 * dpr;
  const controlX = Math.floor((canvas.width - controlWidth * 4 - controlSpacing * 3) / 2);
  const controlY = layerY + 20 * dpr;
  
  // Add Layer button
  if (screenX >= controlX && screenX <= controlX + controlWidth &&
      screenY >= controlY && screenY <= controlY + controlHeight) {
    worldSuperflatLayers.push({ blockId: 'dirt', height: 1 });
    return;
  }
  
  // Remove button
  if (screenX >= controlX + controlWidth + controlSpacing && screenX <= controlX + controlWidth * 2 + controlSpacing &&
      screenY >= controlY && screenY <= controlY + controlHeight) {
    if (worldSuperflatLayers.length > 1) {
      worldSuperflatLayers.splice(selectedSuperflatLayer, 1);
      if (selectedSuperflatLayer >= worldSuperflatLayers.length) {
        selectedSuperflatLayer = Math.max(0, worldSuperflatLayers.length - 1);
      }
    }
    return;
  }
  
  // Move Up button
  if (screenX >= controlX + (controlWidth + controlSpacing) * 2 && screenX <= controlX + controlWidth * 3 + controlSpacing * 2 &&
      screenY >= controlY && screenY <= controlY + controlHeight) {
    if (selectedSuperflatLayer > 0) {
      const temp = worldSuperflatLayers[selectedSuperflatLayer];
      worldSuperflatLayers[selectedSuperflatLayer] = worldSuperflatLayers[selectedSuperflatLayer - 1];
      worldSuperflatLayers[selectedSuperflatLayer - 1] = temp;
      selectedSuperflatLayer--;
    }
    return;
  }
  
  // Move Down button
  if (screenX >= controlX + (controlWidth + controlSpacing) * 3 && screenX <= controlX + controlWidth * 4 + controlSpacing * 3 &&
      screenY >= controlY && screenY <= controlY + controlHeight) {
    if (selectedSuperflatLayer < worldSuperflatLayers.length - 1) {
      const temp = worldSuperflatLayers[selectedSuperflatLayer];
      worldSuperflatLayers[selectedSuperflatLayer] = worldSuperflatLayers[selectedSuperflatLayer + 1];
      worldSuperflatLayers[selectedSuperflatLayer + 1] = temp;
      selectedSuperflatLayer++;
    }
    return;
  }
  
  // Block selector
  const blockSize = 40 * dpr;
  const blockSpacing = 10 * dpr;
  const blocksPerRow = 8;
  const blockGridX = Math.floor((canvas.width - (blockSize * blocksPerRow + blockSpacing * (blocksPerRow - 1))) / 2);
  const controlY2 = controlY + controlHeight + 20 * dpr;
  
  const commonBlocks = ['grass', 'dirt', 'stone', 'sand', 'gravel', 'clay', 'bedrock', 'water'];
  for (let i = 0; i < commonBlocks.length; i++) {
    const blockX = blockGridX + (i % blocksPerRow) * (blockSize + blockSpacing);
    const blockY = controlY2 + Math.floor(i / blocksPerRow) * (blockSize + blockSpacing);
    
    if (screenX >= blockX && screenX <= blockX + blockSize &&
        screenY >= blockY && screenY <= blockY + blockSize) {
      if (selectedSuperflatLayer < worldSuperflatLayers.length) {
        worldSuperflatLayers[selectedSuperflatLayer].blockId = commonBlocks[i];
      }
      return;
    }
  }
  
  // Bottom buttons
  const buttonWidth = 120 * dpr;
  const buttonHeight = 40 * dpr;
  const buttonSpacing = 20 * dpr;
  const buttonY = canvas.height * 0.85;
  
  const backX = Math.floor((canvas.width - buttonWidth * 2 - buttonSpacing) / 2);
  
  // Back button
  if (screenX >= backX && screenX <= backX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    createWorldSubMenu = 'main';
    return;
  }
  
  // Done button
  const doneX = backX + buttonWidth + buttonSpacing;
  if (screenX >= doneX && screenX <= doneX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    createWorldSubMenu = 'main';
    return;
  }
}

function handleAdvancedOptionsClick(screenX, screenY, dpr, canvas) {
  let optionY = canvas.height * 0.25;
  const optionSpacing = 45 * dpr;
  
  // World Size buttons
  const sizeWidth = 100 * dpr;
  const sizeHeight = 35 * dpr;
  const sizeSpacing = 15 * dpr;
  const sizeX = Math.floor((canvas.width - sizeWidth * 3 - sizeSpacing * 2) / 2);
  
  // Small button
  if (screenX >= sizeX && screenX <= sizeX + sizeWidth &&
      screenY >= optionY && screenY <= optionY + sizeHeight) {
    worldSize = 'small';
    return;
  }
  
  // Normal button
  if (screenX >= sizeX + sizeWidth + sizeSpacing && screenX <= sizeX + sizeWidth * 2 + sizeSpacing &&
      screenY >= optionY && screenY <= optionY + sizeHeight) {
    worldSize = 'normal';
    return;
  }
  
  // Large button
  if (screenX >= sizeX + (sizeWidth + sizeSpacing) * 2 && screenX <= sizeX + sizeWidth * 3 + sizeSpacing * 2 &&
      screenY >= optionY && screenY <= optionY + sizeHeight) {
    worldSize = 'large';
    return;
  }
  
  optionY += sizeHeight + optionSpacing;
  
  // Starting Time buttons
  const timeWidth = 120 * dpr;
  const timeHeight = 35 * dpr;
  const timeSpacing = 15 * dpr;
  const timeX = Math.floor((canvas.width - timeWidth * 4 - timeSpacing * 3) / 2);
  
  // Day button
  if (screenX >= timeX && screenX <= timeX + timeWidth &&
      screenY >= optionY && screenY <= optionY + timeHeight) {
    worldStartingTime = 'day';
    return;
  }
  
  // Night button
  if (screenX >= timeX + timeWidth + timeSpacing && screenX <= timeX + timeWidth * 2 + timeSpacing &&
      screenY >= optionY && screenY <= optionY + timeHeight) {
    worldStartingTime = 'night';
    return;
  }
  
  // Sunset button
  if (screenX >= timeX + (timeWidth + timeSpacing) * 2 && screenX <= timeX + timeWidth * 3 + timeSpacing * 2 &&
      screenY >= optionY && screenY <= optionY + timeHeight) {
    worldStartingTime = 'sunset';
    return;
  }
  
  // Dawn button
  if (screenX >= timeX + (timeWidth + timeSpacing) * 3 && screenX <= timeX + timeWidth * 4 + timeSpacing * 3 &&
      screenY >= optionY && screenY <= optionY + timeHeight) {
    worldStartingTime = 'dawn';
    return;
  }
  
  optionY += timeHeight + optionSpacing;
  
  // World Type buttons
  const typeWidth = 120 * dpr;
  const typeHeight = 35 * dpr;
  const typeSpacing = 15 * dpr;
  const typeX = Math.floor((canvas.width - typeWidth * 3 - typeSpacing * 2) / 2);
  
  // Regular button
  if (screenX >= typeX && screenX <= typeX + typeWidth &&
      screenY >= optionY && screenY <= optionY + typeHeight) {
    worldType = 'regular';
    return;
  }
  
  // Superflat button
  if (screenX >= typeX + typeWidth + typeSpacing && screenX <= typeX + typeWidth * 2 + typeSpacing &&
      screenY >= optionY && screenY <= optionY + typeHeight) {
    worldType = 'superflat';
    return;
  }
  
  // Mountains button
  if (screenX >= typeX + (typeWidth + typeSpacing) * 2 && screenX <= typeX + typeWidth * 3 + typeSpacing * 2 &&
      screenY >= optionY && screenY <= optionY + typeHeight) {
    worldType = 'mountains';
    return;
  }
  
  optionY += typeHeight + optionSpacing;
  
  // Checkboxes
  const checkboxSize = 20 * dpr;
  const checkboxX = Math.floor((canvas.width - 400 * dpr) / 2);
  
  // Cheats checkbox
  if (screenX >= checkboxX && screenX <= checkboxX + checkboxSize &&
      screenY >= optionY && screenY <= optionY + checkboxSize) {
    worldCheatsEnabled = !worldCheatsEnabled;
    return;
  }
  
  // Allow Commands checkbox
  if (screenX >= checkboxX + 200 * dpr && screenX <= checkboxX + 200 * dpr + checkboxSize &&
      screenY >= optionY && screenY <= optionY + checkboxSize) {
    worldAllowCommands = !worldAllowCommands;
    return;
  }
  
  optionY += checkboxSize + optionSpacing;
  
  // Additional options
  const addOptionWidth = 150 * dpr;
  const addOptionHeight = 35 * dpr;
  const addOptionSpacing = 15 * dpr;
  const addOptionX = Math.floor((canvas.width - addOptionWidth * 2 - addOptionSpacing) / 2);
  
  // Edit Layers button (only if superflat is selected)
  if (worldType === 'superflat') {
    if (screenX >= addOptionX && screenX <= addOptionX + addOptionWidth &&
        screenY >= optionY && screenY <= optionY + addOptionHeight) {
      createWorldSubMenu = 'superflat';
      return;
    }
  }
  
  optionY += addOptionHeight + optionSpacing;
  

  
  // Bottom buttons
  const buttonWidth = 120 * dpr;
  const buttonHeight = 40 * dpr;
  const buttonSpacing = 20 * dpr;
  const buttonY = canvas.height * 0.85;
  
  const backX = Math.floor((canvas.width - buttonWidth * 2 - buttonSpacing) / 2);
  
  // Back button
  if (screenX >= backX && screenX <= backX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    createWorldSubMenu = 'main';
    return;
  }
  
  // Done button
  const doneX = backX + buttonWidth + buttonSpacing;
  if (screenX >= doneX && screenX <= doneX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    createWorldSubMenu = 'main';
    return;
  }
}



function handleLoadWorldClick(screenX, screenY) {
  const dpr = window.devicePixelRatio;
  const canvas = document.getElementById('gameCanvas');
  
  if (!canvas) return; // Safety check
  
  const buttonWidth = 120 * dpr;
  const buttonHeight = 40 * dpr;
  const buttonX = Math.floor((canvas.width - buttonWidth) / 2);
  const buttonY = canvas.height * 0.6;
  
  // Check Back button
  if (screenX >= buttonX && screenX <= buttonX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    // Back button - old menu system removed
    return;
  }
}

function handleMainMenuHover(screenX, screenY) {
  const dpr = window.devicePixelRatio;
  const canvas = document.getElementById('gameCanvas');
  
  if (!canvas) return; // Safety check
  
  const buttonWidth = 200 * dpr;
  const buttonHeight = 50 * dpr;
  const buttonSpacing = 20 * dpr;
  const totalHeight = buttonHeight * 4 + buttonSpacing * 3;
  const startY = canvas.height * 0.5 - totalHeight / 2;
  
  // Single Player button
  if (screenX >= canvas.width / 2 - buttonWidth / 2 && screenX <= canvas.width / 2 + buttonWidth / 2 &&
      screenY >= startY && screenY <= startY + buttonHeight) {
    mainMenuHover = 0;
    return;
  }
  
  // Load World button
  if (screenX >= canvas.width / 2 - buttonWidth / 2 && screenX <= canvas.width / 2 + buttonWidth / 2 &&
      screenY >= startY + buttonHeight + buttonSpacing && screenY <= startY + buttonHeight * 2 + buttonSpacing) {
    mainMenuHover = 1;
    return;
  }
  
  // Options button
  if (screenX >= canvas.width / 2 - buttonWidth / 2 && screenX <= canvas.width / 2 + buttonWidth / 2 &&
      screenY >= startY + (buttonHeight + buttonSpacing) * 2 && screenY <= startY + buttonHeight * 3 + buttonSpacing * 2) {
    mainMenuHover = 2;
    return;
  }
  
  // Quit Game button
  if (screenX >= canvas.width / 2 - buttonWidth / 2 && screenX <= canvas.width / 2 + buttonWidth / 2 &&
      screenY >= startY + (buttonHeight + buttonSpacing) * 3 && screenY <= startY + buttonHeight * 4 + buttonSpacing * 3) {
    mainMenuHover = 3;
    return;
  }
  
  mainMenuHover = -1;
}

function handleCreateWorldHover(screenX, screenY) {
  const dpr = window.devicePixelRatio;
  const canvas = document.getElementById('gameCanvas');
  
  if (!canvas) return; // Safety check
  
  const subMenu = createWorldSubMenu;
  
  if (subMenu === 'main') {
    handleCreateWorldMainMenuHover(screenX, screenY, dpr, canvas);
  } else if (subMenu === 'superflat') {
    handleSuperflatEditorHover(screenX, screenY, dpr, canvas);
  } else if (subMenu === 'advanced') {
    handleAdvancedOptionsHover(screenX, screenY, dpr, canvas);
  }
}

function handleCreateWorldMainMenuHover(screenX, screenY, dpr, canvas) {
  // Calculate button positions based on the new layout
  const fieldWidth = 300 * dpr;
  const fieldHeight = 40 * dpr;
  const fieldSpacing = 25 * dpr;
  const fieldX = Math.floor((canvas.width - fieldWidth) / 2);
  let fieldY = canvas.height * 0.25;
  
  fieldY += fieldHeight + fieldSpacing;
  fieldY += fieldHeight + fieldSpacing;
  
  // World Type buttons
  const optionWidth = 150 * dpr;
  const optionHeight = 35 * dpr;
  const optionSpacing = 15 * dpr;
  const optionX = Math.floor((canvas.width - optionWidth * 3 - optionSpacing * 2) / 2);
  
  // Regular button
  if (screenX >= optionX && screenX <= optionX + optionWidth &&
      screenY >= fieldY && screenY <= fieldY + optionHeight) {
    createWorldHover = 2;
    return;
  }
  
  // Superflat button
  if (screenX >= optionX + optionWidth + optionSpacing && screenX <= optionX + optionWidth * 2 + optionSpacing &&
      screenY >= fieldY && screenY <= fieldY + optionHeight) {
    createWorldHover = 3;
    return;
  }
  
  // Mountains button
  if (screenX >= optionX + (optionWidth + optionSpacing) * 2 && screenX <= optionX + optionWidth * 3 + optionSpacing * 2 &&
      screenY >= fieldY && screenY <= fieldY + optionHeight) {
    createWorldHover = 4;
    return;
  }
  
  fieldY += optionHeight + fieldSpacing;
  
  // Game Mode buttons
  // Survival button
  if (screenX >= optionX && screenX <= optionX + optionWidth &&
      screenY >= fieldY && screenY <= fieldY + optionHeight) {
    createWorldHover = 5;
    return;
  }
  
  // Creative button
  if (screenX >= optionX + optionWidth + optionSpacing && screenX <= optionX + optionWidth * 2 + optionSpacing &&
      screenY >= fieldY && screenY <= fieldY + optionHeight) {
    createWorldHover = 6;
    return;
  }
  
  fieldY += optionHeight + fieldSpacing;
  fieldY += 20 * dpr + fieldSpacing;
  
  // Bottom buttons
  const buttonWidth = 120 * dpr;
  const buttonHeight = 40 * dpr;
  const buttonSpacing = 20 * dpr;
  const buttonY = fieldY + 20 * dpr;
  
  const createX = Math.floor((canvas.width - buttonWidth * 3 - buttonSpacing * 2) / 2);
  
  // Create button
  if (screenX >= createX && screenX <= createX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    createWorldHover = 0;
    return;
  }
  
  // Options button
  const optionsX = createX + buttonWidth + buttonSpacing;
  if (screenX >= optionsX && screenX <= optionsX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    createWorldHover = 7;
    return;
  }
  
  // Back button
  const backX = optionsX + buttonWidth + buttonSpacing;
  if (screenX >= backX && screenX <= backX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    createWorldHover = 1;
    return;
  }
  
  createWorldHover = -1;
}

function handleSuperflatEditorHover(screenX, screenY, dpr, canvas) {
  // Layer list
  const layerWidth = 400 * dpr;
  const layerHeight = 50 * dpr;
  const layerSpacing = 10 * dpr;
  const layerX = Math.floor((canvas.width - layerWidth) / 2);
  let layerY = canvas.height * 0.35;
  
  // Check layer hovers
  for (let i = 0; i < worldSuperflatLayers.length; i++) {
    if (screenX >= layerX && screenX <= layerX + layerWidth &&
        screenY >= layerY && screenY <= layerY + layerHeight) {
      superflatLayerHover = i;
      return;
    }
    layerY += layerHeight + layerSpacing;
  }
  
  // Layer controls
  const controlWidth = 100 * dpr;
  const controlHeight = 35 * dpr;
  const controlSpacing = 15 * dpr;
  const controlX = Math.floor((canvas.width - controlWidth * 4 - controlSpacing * 3) / 2);
  const controlY = layerY + 20 * dpr;
  
  // Add Layer button
  if (screenX >= controlX && screenX <= controlX + controlWidth &&
      screenY >= controlY && screenY <= controlY + controlHeight) {
    createWorldHover = 8;
    return;
  }
  
  // Remove button
  if (screenX >= controlX + controlWidth + controlSpacing && screenX <= controlX + controlWidth * 2 + controlSpacing &&
      screenY >= controlY && screenY <= controlY + controlHeight) {
    createWorldHover = 9;
    return;
  }
  
  // Move Up button
  if (screenX >= controlX + (controlWidth + controlSpacing) * 2 && screenX <= controlX + controlWidth * 3 + controlSpacing * 2 &&
      screenY >= controlY && screenY <= controlY + controlHeight) {
    createWorldHover = 10;
    return;
  }
  
  // Move Down button
  if (screenX >= controlX + (controlWidth + controlSpacing) * 3 && screenX <= controlX + controlWidth * 4 + controlSpacing * 3 &&
      screenY >= controlY && screenY <= controlY + controlHeight) {
    createWorldHover = 11;
    return;
  }
  
  // Bottom buttons
  const buttonWidth = 120 * dpr;
  const buttonHeight = 40 * dpr;
  const buttonSpacing = 20 * dpr;
  const buttonY = canvas.height * 0.85;
  
  const backX = Math.floor((canvas.width - buttonWidth * 2 - buttonSpacing) / 2);
  
  // Back button
  if (screenX >= backX && screenX <= backX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    createWorldHover = 12;
    return;
  }
  
  // Done button
  const doneX = backX + buttonWidth + buttonSpacing;
  if (screenX >= doneX && screenX <= doneX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    createWorldHover = 13;
    return;
  }
  
  createWorldHover = -1;
  superflatLayerHover = -1;
}

function handleAdvancedOptionsHover(screenX, screenY, dpr, canvas) {
  let optionY = canvas.height * 0.25;
  const optionSpacing = 45 * dpr;
  
  // World Size buttons
  const sizeWidth = 100 * dpr;
  const sizeHeight = 35 * dpr;
  const sizeSpacing = 15 * dpr;
  const sizeX = Math.floor((canvas.width - sizeWidth * 3 - sizeSpacing * 2) / 2);
  
  // Small button
  if (screenX >= sizeX && screenX <= sizeX + sizeWidth &&
      screenY >= optionY && screenY <= optionY + sizeHeight) {
    createWorldHover = 14;
    return;
  }
  
  // Normal button
  if (screenX >= sizeX + sizeWidth + sizeSpacing && screenX <= sizeX + sizeWidth * 2 + sizeSpacing &&
      screenY >= optionY && screenY <= optionY + sizeHeight) {
    createWorldHover = 15;
    return;
  }
  
  // Large button
  if (screenX >= sizeX + (sizeWidth + sizeSpacing) * 2 && screenX <= sizeX + sizeWidth * 3 + sizeSpacing * 2 &&
      screenY >= optionY && screenY <= optionY + sizeHeight) {
    createWorldHover = 16;
    return;
  }
  
  optionY += sizeHeight + optionSpacing;
  
  // Starting Time buttons
  const timeWidth = 120 * dpr;
  const timeHeight = 35 * dpr;
  const timeSpacing = 15 * dpr;
  const timeX = Math.floor((canvas.width - timeWidth * 4 - timeSpacing * 3) / 2);
  
  // Day button
  if (screenX >= timeX && screenX <= timeX + timeWidth &&
      screenY >= optionY && screenY <= optionY + timeHeight) {
    createWorldHover = 17;
    return;
  }
  
  // Night button
  if (screenX >= timeX + timeWidth + timeSpacing && screenX <= timeX + timeWidth * 2 + timeSpacing &&
      screenY >= optionY && screenY <= optionY + timeHeight) {
    createWorldHover = 18;
    return;
  }
  
  // Sunset button
  if (screenX >= timeX + (timeWidth + timeSpacing) * 2 && screenX <= timeX + timeWidth * 3 + timeSpacing * 2 &&
      screenY >= optionY && screenY <= optionY + timeHeight) {
    createWorldHover = 19;
    return;
  }
  
  // Dawn button
  if (screenX >= timeX + (timeWidth + timeSpacing) * 3 && screenX <= timeX + timeWidth * 4 + timeSpacing * 3 &&
      screenY >= optionY && screenY <= optionY + timeHeight) {
    createWorldHover = 20;
    return;
  }
  
  optionY += timeHeight + optionSpacing;
  
  // World Type buttons
  const typeWidth = 120 * dpr;
  const typeHeight = 35 * dpr;
  const typeSpacing = 15 * dpr;
  const typeX = Math.floor((canvas.width - typeWidth * 3 - typeSpacing * 2) / 2);
  
  // Regular button
  if (screenX >= typeX && screenX <= typeX + typeWidth &&
      screenY >= optionY && screenY <= optionY + typeHeight) {
    createWorldHover = 23;
    return;
  }
  
  // Superflat button
  if (screenX >= typeX + typeWidth + typeSpacing && screenX <= typeX + typeWidth * 2 + typeSpacing &&
      screenY >= optionY && screenY <= optionY + typeHeight) {
    createWorldHover = 24;
    return;
  }
  
  // Mountains button
  if (screenX >= typeX + (typeWidth + typeSpacing) * 2 && screenX <= typeX + typeWidth * 3 + typeSpacing * 2 &&
      screenY >= optionY && screenY <= optionY + typeHeight) {
    createWorldHover = 25;
    return;
  }
  
  optionY += typeHeight + optionSpacing;
  
  // Checkboxes
  const checkboxSize = 20 * dpr;
  const checkboxX = Math.floor((canvas.width - 400 * dpr) / 2);
  
  // Cheats checkbox
  if (screenX >= checkboxX && screenX <= checkboxX + checkboxSize &&
      screenY >= optionY && screenY <= optionY + checkboxSize) {
    createWorldHover = 30;
    return;
  }
  
  // Allow Commands checkbox
  if (screenX >= checkboxX + 200 * dpr && screenX <= checkboxX + 200 * dpr + checkboxSize &&
      screenY >= optionY && screenY <= optionY + checkboxSize) {
    createWorldHover = 31;
    return;
  }
  
  optionY += checkboxSize + optionSpacing;
  
  // Additional options
  const addOptionWidth = 150 * dpr;
  const addOptionHeight = 35 * dpr;
  const addOptionSpacing = 15 * dpr;
  const addOptionX = Math.floor((canvas.width - addOptionWidth * 2 - addOptionSpacing) / 2);
  
  // Edit Layers button (only if superflat is selected)
  if (worldType === 'superflat') {
    if (screenX >= addOptionX && screenX <= addOptionX + addOptionWidth &&
        screenY >= optionY && screenY <= optionY + addOptionHeight) {
      createWorldHover = 26;
      return;
    }
  }
  
  optionY += addOptionHeight + optionSpacing;
  

  
  // Bottom buttons
  const buttonWidth = 120 * dpr;
  const buttonHeight = 40 * dpr;
  const buttonSpacing = 20 * dpr;
  const buttonY = canvas.height * 0.9;
  
  const backX = Math.floor((canvas.width - buttonWidth * 2 - buttonSpacing) / 2);
  
  // Back button
  if (screenX >= backX && screenX <= backX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    createWorldHover = 21;
    return;
  }
  
  // Done button
  const doneX = backX + buttonWidth + buttonSpacing;
  if (screenX >= doneX && screenX <= doneX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    createWorldHover = 22;
    return;
  }
  
  createWorldHover = -1;
}

function handlePauseMenuHover(screenX, screenY) {
  const dpr = window.devicePixelRatio;
  const canvas = document.getElementById('gameCanvas');
  
  if (!canvas) return; // Safety check
  
  if (pauseMenuState === 'options') {
    // Handle options menu hover
    const boxWidth = 350 * dpr;
    const boxHeight = 300 * dpr;
    const x = Math.floor((canvas.width - boxWidth) / 2);
    const y = Math.floor((canvas.height - boxHeight) / 2);
    
    const buttonWidth = 280 * dpr;
    const buttonHeight = 50 * dpr;
    const buttonSpacing = 20 * dpr;
    const buttonX = Math.floor((canvas.width - buttonWidth) / 2);
    let buttonY = y + 100 * dpr;
    
    // Check Back button
    if (screenX >= buttonX && screenX <= buttonX + buttonWidth &&
        screenY >= buttonY && screenY <= buttonY + buttonHeight) {
      pauseMenuHover = 0;
      return;
    }
    buttonY += buttonHeight + buttonSpacing;
    
    // Check Graphics button
    if (screenX >= buttonX && screenX <= buttonX + buttonWidth &&
        screenY >= buttonY && screenY <= buttonY + buttonHeight) {
      pauseMenuHover = 1;
      return;
    }
    buttonY += buttonHeight + buttonSpacing;
    
    // Check Sound button
    if (screenX >= buttonX && screenX <= buttonX + buttonWidth &&
        screenY >= buttonY && screenY <= buttonY + buttonHeight) {
      pauseMenuHover = 2;
      return;
    }
    
    pauseMenuHover = -1;
    return;
  }
  
  // Handle main pause menu hover
  const boxWidth = 350 * dpr;
  const boxHeight = 400 * dpr;
  const x = Math.floor((canvas.width - boxWidth) / 2);
  const y = Math.floor((canvas.height - boxHeight) / 2);
  
  const buttonWidth = 280 * dpr;
  const buttonHeight = 50 * dpr;
  const buttonSpacing = 20 * dpr;
  const buttonX = Math.floor((canvas.width - buttonWidth) / 2);
  let buttonY = y + 100 * dpr;
  
  // Check each button (3 buttons now: Resume, Options, Back to Main)
  for (let i = 0; i < 3; i++) {
    if (screenX >= buttonX && screenX <= buttonX + buttonWidth &&
        screenY >= buttonY && screenY <= buttonY + buttonHeight) {
      pauseMenuHover = i;
      return;
    }
    buttonY += buttonHeight + buttonSpacing;
  }
  
  pauseMenuHover = -1;
}

function handlePauseMenuClick(screenX, screenY) {
  const dpr = window.devicePixelRatio;
  const canvas = document.getElementById('gameCanvas');
  
  if (!canvas) return; // Safety check
  
  if (pauseMenuState === 'options') {
    // Handle options menu clicks
    const boxWidth = 350 * dpr;
    const boxHeight = 300 * dpr;
    const x = Math.floor((canvas.width - boxWidth) / 2);
    const y = Math.floor((canvas.height - boxHeight) / 2);
    
    const buttonWidth = 280 * dpr;
    const buttonHeight = 50 * dpr;
    const buttonSpacing = 20 * dpr;
    const buttonX = Math.floor((canvas.width - buttonWidth) / 2);
    let buttonY = y + 100 * dpr;
    
    // Check Back button
    if (screenX >= buttonX && screenX <= buttonX + buttonWidth &&
        screenY >= buttonY && screenY <= buttonY + buttonHeight) {
      pauseMenuState = 'main';
      return;
    }
    buttonY += buttonHeight + buttonSpacing;
    
    // Check Graphics button
    if (screenX >= buttonX && screenX <= buttonX + buttonWidth &&
        screenY >= buttonY && screenY <= buttonY + buttonHeight) {
      alert('Graphics settings would go here!');
      return;
    }
    buttonY += buttonHeight + buttonSpacing;
    
    // Check Sound button
    if (screenX >= buttonX && screenX <= buttonX + buttonWidth &&
        screenY >= buttonY && screenY <= buttonY + buttonHeight) {
      alert('Sound settings would go here!');
      return;
    }
    return;
  }
  
  // Handle main pause menu clicks
  const boxWidth = 350 * dpr;
  const boxHeight = 400 * dpr;
  const x = Math.floor((canvas.width - boxWidth) / 2);
  const y = Math.floor((canvas.height - boxHeight) / 2);
  
  // Button dimensions
  const buttonWidth = 280 * dpr;
  const buttonHeight = 50 * dpr;
  const buttonSpacing = 20 * dpr;
  const buttonX = Math.floor((canvas.width - buttonWidth) / 2);
  let buttonY = y + 100 * dpr;
  
  // Check Resume button
  if (screenX >= buttonX && screenX <= buttonX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    gamePaused = false;
    return;
  }
  buttonY += buttonHeight + buttonSpacing;
  
  // Check Game Mode button
  if (screenX >= buttonX && screenX <= buttonX + buttonWidth &&
      screenY >= buttonY && buttonY <= buttonY + buttonHeight) {
    creativeMode = !creativeMode;
    world.creativeMode = creativeMode;
    
    // Reset flight if switching to survival
    if (!creativeMode && player.creativeFlying) {
      player.creativeFlying = false;
    }
    
    // Close creative inventory if switching to survival
    if (!creativeMode && inventoryOpen) {
      inventoryOpen = false;
    }
    
    return;
  }
  buttonY += buttonHeight + buttonSpacing;
  
  // Check Options button
  if (screenX >= buttonX && screenX <= buttonX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    pauseMenuState = 'options';
    return;
  }
  buttonY += buttonHeight + buttonSpacing;
  
  // Check Quit to Title button
  if (screenX >= buttonX && screenX <= buttonX + buttonWidth &&
      screenY >= buttonY && screenY <= buttonY + buttonHeight) {
    // Quit to Title button - old menu system removed
    gamePaused = false;
    return;
  }
}

function handleInventoryClick(screenX, screenY, isRightClick = false) {
  // Check if renderer exists and has getUIHit method
  if (!renderer || typeof renderer.getUIHit !== 'function') {
    console.warn('Renderer or getUIHit method not available');
    return false;
  }
  
  const hit = renderer.getUIHit(screenX, screenY);
  if (!hit) return false;

  if (hit.area === 'craftOut') {
    if (tryPickupCraft()) return true;
    return true;
  }

  function getSlotRef(area, index) {
    if (area === 'inventory') {
      return {
        get: () => inventory.getSlot(index),
        set: (v) => inventory.setSlot(index, v),
        take: () => inventory.takeSlot(index),
      };
    } else if (area === 'container') {
      return {
        get: () => {
          if (!openContainer || !openContainer.slots) {
            return null;
          }
          const blockId = world.getBlockId(openContainer.tileX, openContainer.tileY);
          if (blockId !== 'chest' && blockId !== 'crafting_table') {
            return null;
          }
          return openContainer.slots[index] ?? null;
        },
        set: (v) => { 
          if (openContainer && openContainer.slots) {
            const blockId = world.getBlockId(openContainer.tileX, openContainer.tileY);
            if (blockId === 'chest' || blockId === 'crafting_table') {
              openContainer.slots[index] = v;
            }
          }
        },
        take: () => {
          if (!openContainer || !openContainer.slots) {
            return null;
          }
          const blockId = world.getBlockId(openContainer.tileX, openContainer.tileY);
          if (blockId !== 'chest' && blockId !== 'crafting_table') {
            return null;
          }
          const s = openContainer.slots[index];
          openContainer.slots[index] = null;
          return s;
        },
      };
    } else if (area === 'craft') {
      const grid = openContainer?.title === 'Crafting Table' ? craftGrid : inventoryCraftGrid;
      return {
        get: () => grid[index],
        set: (v) => { grid[index] = v; },
        take: () => { const s = grid[index]; grid[index] = null; return s; }
      };
    }
    return null;
  }

  if (hit.area === 'creativeTab' && creativeMode) {
    creativeTab = hit.tabId;
    creativeScrollY = 0; // Reset scroll when switching tabs
    return true;
  }

  if (hit.area === 'creative' && creativeMode) {
    // Check if inventory has getCreativeCategories method
    if (!inventory || typeof inventory.getCreativeCategories !== 'function') {
      console.warn('Inventory getCreativeCategories method not available');
      return false;
    }
    
    const categories = inventory.getCreativeCategories();
    const currentCategory = categories[creativeTab] || categories.building;
    const item = currentCategory.items[hit.index];
    if (!item) return false;
    if (!draggingStack) {
      draggingStack = { ...item };
    } else {
      const s0 = inventory.getSlot(0);
      if (!s0) {
        inventory.setSlot(0, draggingStack);
        draggingStack = null;
      } else if (inventory.canMerge(s0, draggingStack)) {
        const room = (s0.maxStack ?? 64) - s0.count;
        const take = Math.min(room, draggingStack.count);
        s0.count += take;
        draggingStack.count -= take;
        if (draggingStack.count <= 0) draggingStack = null;
      }
    }
    recomputeCraft();
    return true;
  }

  const slotRef = getSlotRef(hit.area, hit.index);
  if (!slotRef) return false;

  const slot = slotRef.get();

  if (!draggingStack) {
    if (!slot) return false;
    if (isRightClick && slot.count > 1) {
      const take = Math.ceil(slot.count / 2);
      draggingStack = { ...slot, count: take };
      slot.count -= take;
      if (slot.count <= 0) slotRef.set(null);
    } else {
      draggingStack = slotRef.take();
    }
    recomputeCraft();
    return true;
  }

  if (!slot) {
    if (isRightClick) {
      const one = { ...draggingStack, count: 1 };
      slotRef.set(one);
      draggingStack.count -= 1;
      if (draggingStack.count <= 0) draggingStack = null;
    } else {
      if (hit.area === 'container') {
        if (openContainer && (world.getBlockId(openContainer.tileX, openContainer.tileY) === 'chest' || 
                              world.getBlockId(openContainer.tileX, openContainer.tileY) === 'crafting_table')) {
          slotRef.set(draggingStack);
          draggingStack = null;
        } else {
          if (draggingStack.type === 'block') {
            inventory.addBlock(draggingStack.blockId, draggingStack.count);
          } else {
            inventory.addItem(draggingStack.itemId, draggingStack.count);
          }
          draggingStack = null;
        }
      } else {
        slotRef.set(draggingStack);
        draggingStack = null;
      }
    }
    recomputeCraft();
    return true;
  }

  if (inventory.canMerge(slot, draggingStack)) {
    if (isRightClick) {
      if (slot.count < (slot.maxStack ?? 64)) {
        slot.count += 1;
        draggingStack.count -= 1;
        if (draggingStack.count <= 0) draggingStack = null;
      }
    } else {
      const room = (slot.maxStack ?? 64) - slot.count;
      const take = Math.min(room, draggingStack.count);
      slot.count += take;
      draggingStack.count -= take;
      if (draggingStack.count <= 0) draggingStack = null;
    }
    recomputeCraft();
    return true;
  } else {
    if (isRightClick) {
      const one = { ...draggingStack, count: 1 };
      let placed = false;
      let targetSlots = null;
      if (hit.area === 'inventory') {
        targetSlots = inventory.slots;
      } else if (hit.area === 'container') {
        targetSlots = openContainer?.slots;
      } else if (hit.area === 'craft') {
        targetSlots = (openContainer?.title === 'Crafting Table' ? craftGrid : inventoryCraftGrid);
      }

      if (targetSlots) {
        for (let i = 0; i < targetSlots.length; i++) {
          const s = targetSlots[i];
          if (!s) {
            targetSlots[i] = one;
            draggingStack.count -= 1;
            if (draggingStack.count <= 0) draggingStack = null;
            placed = true;
            break;
          } else if (inventory.canMerge(s, one) && s.count < (s.maxStack ?? 64)) {
            s.count += 1;
            draggingStack.count -= 1;
            if (draggingStack.count <= 0) draggingStack = null;
            placed = true;
            break;
          }
        }
      }
      recomputeCraft();
      return placed;
    } else {
      const temp = slotRef.take();
      slotRef.set(draggingStack);
      draggingStack = temp;
      recomputeCraft();
      return true;
    }
  }
}

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const screenX = (e.clientX - rect.left) * window.devicePixelRatio;
  const screenY = (e.clientY - rect.top) * window.devicePixelRatio;
  const { worldX, worldY, tileX, tileY } = getMouseTileFromRaw(screenX, screenY);
  const uiOpen = inventoryOpen || !!openContainer;
  

  
  // Handle menu clicks (only for canvas-based menus, HTML menus are handled separately)
  // Note: HTML menus are now handled by the MenuManager class, so these old handlers are disabled
  // if (gameState === 'mainMenu' && document.getElementById('mainMenu')?.classList.contains('hidden')) {
  //   mainMenuPressed = mainMenuHover;
  //   handleMainMenuClick(screenX, screenY);
  //   return;
  // }
  
  // if (gameState === 'createWorld' && document.getElementById('createWorldMenu')?.classList.contains('hidden')) {
  //   createWorldPressed = createWorldHover;
  //   handleCreateWorldClick(screenX, screenY);
  //   return;
  // }
  
  // if (gameState === 'loadWorld' && document.getElementById('loadWorldMenu')?.classList.contains('hidden')) {
  //   handleLoadWorldClick(screenX, screenY);
  //   return;
  // }
  
  // if (gameState === 'options' && document.getElementById('optionsMenu')?.classList.contains('hidden')) {
  //   optionsPressed = optionsHover;
  //   handleOptionsClick(screenX, screenY);
  //   return;
  // }
  
  // Handle pause menu clicks
  if (gamePaused) {
    handlePauseMenuClick(screenX, screenY);
    return;
  }
  
  if (uiOpen) {
    if (e.button === 0) {
      isDraggingLeftClick = true;
      lastDragSlot = -1;
      const hit = renderer && typeof renderer.getUIHit === 'function' ? renderer.getUIHit(screenX, screenY) : null;
      if (hit) {
        const currentTime = Date.now();
        if (currentTime - lastClickTime < 300 && lastClickSlot === hit.index && hit.area === 'inventory') {
          mergeSameToSlot(hit.index);
          lastClickTime = 0;
          lastClickSlot = -1;
          return;
        } else {
          lastClickTime = currentTime;
          lastClickSlot = hit.index;
        }
      }
      handleInventoryClick(screenX, screenY, false);
    } else if (e.button === 2) {
      handleInventoryClick(screenX, screenY, true);
    }
    return;
  }
  if (e.button === 2) {
    const blockId = world.getBlockId(tileX, tileY);
    if (blockId === 'crafting_table') {
      openContainer = {
        title: 'Crafting Table',
        slots: craftGrid,
        capacity: 9,
        tileX,
        tileY,
      };
      inventoryOpen = true;
      recomputeCraft();
      return;
    } else if (blockId === 'chest') {
      const cell = world.getCell(tileX, tileY);
      if (!cell.meta) cell.meta = {};
      
      let slots = cell.meta.inv;
      let capacity = 27;
      let title = 'Chest';
      
      if (cell.meta.chestType === 'left') {
        title = 'Double Chest';
        capacity = 54;
        if (!slots) {
          slots = Array.from({ length: 54 }, () => null);
          cell.meta.inv = slots;
        }
      } else if (cell.meta.chestType === 'right') {
        title = 'Double Chest';
        capacity = 54;
        if (world.inBounds(tileX - 1, tileY) && world.getBlockId(tileX - 1, tileY) === 'chest') {
          const leftCell = world.getCell(tileX - 1, tileY);
          if (leftCell.meta && leftCell.meta.chestType === 'left') {
            slots = leftCell.meta.inv;
            if (!slots) {
              slots = Array.from({ length: 54 }, () => null);
              leftCell.meta.inv = slots;
            }
          }
        }
      } else {
        if (!slots) {
          slots = Array.from({ length: 27 }, () => null);
          cell.meta.inv = slots;
        }
      }
      
      openContainer = {
        title: title,
        slots: slots,
        capacity: capacity,
        tileX,
        tileY,
      };
      inventoryOpen = true;
      recomputeCraft();
      return;
    }

    const hotSlot = inventory.getSlot(selectedIndex);
    if (!hotSlot || hotSlot.type !== 'block') return;
    if (!world.inBounds(tileX, tileY)) return;
    const existing = world.getBlockId(tileX, tileY);
    const isNatureBlock = existing === 'short_grass' || existing === 'poppy' || existing === 'fern';
    if (existing !== 'air' && !isNatureBlock) return;
    const tileRect = { x: tileX * TILE_SIZE, y: tileY * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
    const playerRect = { x: player.x, y: player.y, w: player.width, h: player.height };
    if (rectsOverlap(tileRect.x, tileRect.y, tileRect.w, tileRect.h, playerRect.x, playerRect.y, playerRect.w, playerRect.h)) return;
    const placed = placer.place(world, { type: 'block', blockId: hotSlot.blockId }, tileX, tileY, {
      mouseWorldX: worldX,
      mouseWorldY: worldY,
      playerX: player.x,
      playerY: player.y,
      modifierFlip: input.isKeyDown('KeyF'),
      rotate: input.isKeyDown('KeyR'),
      background: backgroundBuild
    });
    if (placed) {
      // Sync block placement in multiplayer
      if (window.hostedRoom || window.multiplayerConnection) {
        const cell = world.getCell(tileX, tileY);
        menuManager.syncBlockChange(tileX, tileY, hotSlot.blockId, cell ? cell.meta : null);
      }
      
      if (hotSlot.blockId === 'oak_leaves') {
        const cell = world.getCell(tileX, tileY);
        if (!cell.meta) cell.meta = {};
        cell.meta.placed = true;
      }
      if (!creativeMode) {
        if (hotSlot.blockId === 'chest') {
          const cell = world.getCell(tileX, tileY);
          if (!cell.meta) cell.meta = {};
          if (!cell.meta.inv) cell.meta.inv = Array.from({ length: 27 }, () => null);
        }
        hotSlot.count -= 1;
        if (hotSlot.count <= 0) inventory.setSlot(selectedIndex, null);
      }
    }
  }
});

// Handle mouse movement for drag placement and pause menu hover
canvas.addEventListener('mousemove', (e) => {
  // Handle menu hover (only for canvas-based menus, HTML menus are handled separately)
  // Note: HTML menus are now handled by the MenuManager class, so these old handlers are disabled
  // if (gameState === 'mainMenu' && document.getElementById('mainMenu')?.classList.contains('hidden')) {
  //   const rect = canvas.getBoundingClientRect();
  //   const screenX = (e.clientX - rect.left) * window.devicePixelRatio;
  //   const screenY = (e.clientY - rect.top) * window.devicePixelRatio;
  //   handleMainMenuHover(screenX, screenY);
  //   return;
  // }
  
  // if (gameState === 'createWorld' && document.getElementById('createWorldMenu')?.classList.contains('hidden')) {
  //   const rect = canvas.getBoundingClientRect();
  //   const screenX = (e.clientX - rect.left) * window.devicePixelRatio;
  //   const screenY = (e.clientY - rect.top) * window.devicePixelRatio;
  //   handleCreateWorldHover(screenX, screenY);
  //   return;
  // }
  
  // if (gameState === 'options' && document.getElementById('optionsMenu')?.classList.contains('hidden')) {
  //   const rect = canvas.getBoundingClientRect();
  //   const screenX = (e.clientX - rect.left) * window.devicePixelRatio;
  //   const screenY = (e.clientY - rect.top) * window.devicePixelRatio;
  //   handleOptionsHover(screenX, screenY);
  //   return;
  // }
  
  // Handle pause menu hover
  if (gamePaused) {
    const rect = canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * window.devicePixelRatio;
    const screenY = (e.clientY - rect.top) * window.devicePixelRatio;
    handlePauseMenuHover(screenX, screenY);
    return;
  }
  
  if (!isDraggingLeftClick || !draggingStack) return;
  
  const rect = canvas.getBoundingClientRect();
  const screenX = (e.clientX - rect.left) * window.devicePixelRatio;
  const screenY = (e.clientY - rect.top) * window.devicePixelRatio;
  
  const hit = renderer && typeof renderer.getUIHit === 'function' ? renderer.getUIHit(screenX, screenY) : null;
  if (hit && hit.area === 'inventory') {
    if (hit.index !== lastDragSlot) {
      lastDragSlot = hit.index;
      const slot = inventory.getSlot(hit.index);
      if (!slot || inventory.canMerge(slot, draggingStack)) {
        const oneItem = { ...draggingStack, count: 1 };
        
        if (!slot) {
          inventory.setSlot(hit.index, oneItem);
        } else {
          const room = (slot.maxStack ?? 64) - slot.count;
          if (room > 0) {
            slot.count += 1;
          }
        }
        
        draggingStack.count -= 1;
        
        if (draggingStack.count <= 0) {
          draggingStack = null;
          isDraggingLeftClick = false;
        }
        
        recomputeCraft();
      }
    }
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    isDraggingLeftClick = false;
    lastDragSlot = -1;
    
    // Reset button pressed states - old menu system removed
  }
  
  if (!(inventoryOpen || openContainer)) return;
  const rect = canvas.getBoundingClientRect();
  const screenX = (e.clientX - rect.left) * window.devicePixelRatio;
  const screenY = (e.clientY - rect.top) * window.devicePixelRatio;

  const hit = renderer && typeof renderer.getUIHit === 'function' ? renderer.getUIHit(screenX, screenY) : null;

  if (draggingStack && !hit) {
    if (draggingStack.type === 'block') {
      inventory.addBlock(draggingStack.blockId, draggingStack.count);
    } else {
      for (let i = 0; i < inventory.TOTAL_SLOTS && draggingStack && draggingStack.count > 0; i++) {
        const s = inventory.slots[i];
        if (s && inventory.canMerge(s, draggingStack) && s.count < (s.maxStack ?? 64)) {
          const room = (s.maxStack ?? 64) - s.count;
          const take = Math.min(room, draggingStack.count);
          s.count += take;
          draggingStack.count -= take;
        } else if (!s && draggingStack) {
          inventory.slots[i] = draggingStack;
          draggingStack = null;
          break;
        }
      }
      if (draggingStack && draggingStack.count > 0) {
        if (!inventory.slots[0]) {
          inventory.slots[0] = draggingStack;
        } else {
          const s0 = inventory.slots[0];
          if (inventory.canMerge(s0, draggingStack)) {
            const room = (s0.maxStack ?? 64) - s0.count;
            const take = Math.min(room, draggingStack.count);
            s0.count += take;
            draggingStack.count -= take;
          }
        }
      }
    }
    draggingStack = null;
    recomputeCraft();
    return;
  }

  if (e.button === 0 || e.button === 2) {
    handleInventoryClick(screenX, screenY, e.button === 2);
  }
});


canvas.addEventListener('wheel', (e) => {
  if (inventoryOpen || openContainer) {
    if (creativeMode && inventoryOpen) {
      // Handle creative inventory scrolling
      const scrollAmount = 40; // pixels per scroll step
      creativeScrollY += e.deltaY > 0 ? scrollAmount : -scrollAmount;
      creativeScrollY = Math.max(0, creativeScrollY); // Prevent negative scroll
      e.preventDefault();
    }
    return;
  }
  if (e.deltaY > 0) {
    selectedIndex = (selectedIndex + 1) % 9;
  } else {
    selectedIndex = (selectedIndex + 8) % 9;
  }
  e.preventDefault();
});

window.addEventListener('keydown', (e) => {
  if (textInputMode) {
    if (e.code === 'Escape') {
      textInputMode = false;
      if (typeof window !== 'undefined') {
        window.textInputMode = false;
      }
      textInputValue = '';
      commandSuggestions = [];
      selectedSuggestionIndex = -1;
      e.preventDefault();
      return;
    }
    
    if (e.code === 'Enter') {
      if (textInputValue.trim()) {
        // Add to chat history
        chatHistory.push(textInputValue);
        if (chatHistory.length > 20) {
          chatHistory.shift(); // Keep only last 20 messages
        }
      }
      chatHistoryIndex = -1; // Reset history index
      
      processTextInputCommand(textInputValue);
      textInputMode = false;
      if (typeof window !== 'undefined') {
        window.textInputMode = false;
      }
      textInputValue = '';
      commandSuggestions = [];
      selectedSuggestionIndex = -1;
      e.preventDefault();
      return;
    }
    
    if (e.code === 'Backspace') {
      textInputValue = textInputValue.slice(0, -1);
      updateCommandSuggestions();
      e.preventDefault();
      return;
    }
    
    if (e.code === 'ArrowUp') {
      if (itemSuggestions.length > 0) {
        // Navigate through item suggestions
        if (selectedItemIndex > 0) {
          selectedItemIndex--;
        } else if (selectedItemIndex === 0) {
          selectedItemIndex = -1; // Back to original input
        } else {
          // If no item suggestion selected, try command suggestions
          if (commandSuggestions.length > 0) {
            if (selectedSuggestionIndex > 0) {
              selectedSuggestionIndex--;
            } else if (selectedSuggestionIndex === 0) {
              selectedSuggestionIndex = -1;
            } else {
              // Try chat history
              if (chatHistoryIndex < chatHistory.length - 1) {
                chatHistoryIndex++;
                textInputValue = chatHistory[chatHistory.length - 1 - chatHistoryIndex];
                commandSuggestions = [];
                selectedSuggestionIndex = -1;
                itemSuggestions = [];
                selectedItemIndex = -1;
              }
            }
          } else {
            // Try chat history
            if (chatHistoryIndex < chatHistory.length - 1) {
              chatHistoryIndex++;
              textInputValue = chatHistory[chatHistory.length - 1 - chatHistoryIndex];
            }
          }
        }
      } else if (commandSuggestions.length > 0) {
        // Navigate through command suggestions
        if (selectedSuggestionIndex > 0) {
          selectedSuggestionIndex--;
        } else if (selectedSuggestionIndex === 0) {
          selectedSuggestionIndex = -1; // Back to original input
        } else {
          // If no suggestion selected, try chat history
          if (chatHistoryIndex < chatHistory.length - 1) {
            chatHistoryIndex++;
            textInputValue = chatHistory[chatHistory.length - 1 - chatHistoryIndex];
            commandSuggestions = [];
            selectedSuggestionIndex = -1;
          }
        }
      } else {
        // Fall back to chat history
        if (chatHistoryIndex < chatHistory.length - 1) {
          chatHistoryIndex++;
          textInputValue = chatHistory[chatHistory.length - 1 - chatHistoryIndex];
        }
      }
      e.preventDefault();
      return;
    }
    
    if (e.code === 'ArrowDown') {
      if (itemSuggestions.length > 0) {
        // Navigate through item suggestions
        if (selectedItemIndex < itemSuggestions.length - 1) {
          selectedItemIndex++;
        } else {
          selectedItemIndex = -1; // Back to original input
        }
      } else if (commandSuggestions.length > 0) {
        // Navigate through command suggestions
        if (selectedSuggestionIndex < commandSuggestions.length - 1) {
          selectedSuggestionIndex++;
        } else {
          selectedSuggestionIndex = -1; // Back to original input
        }
      } else {
        // Fall back to chat history
        if (chatHistoryIndex > 0) {
          chatHistoryIndex--;
          textInputValue = chatHistory[chatHistory.length - 1 - chatHistoryIndex];
        } else if (chatHistoryIndex === 0) {
          chatHistoryIndex = -1;
          textInputValue = '';
        }
      }
      e.preventDefault();
      return;
    }
    
    if (e.code === 'Tab') {
      if (itemSuggestions.length > 0) {
        if (selectedItemIndex >= 0 && selectedItemIndex < itemSuggestions.length) {
          // Complete with selected item suggestion
          const suggestion = itemSuggestions[selectedItemIndex];
          const parts = textInputValue.slice(1).split(' ');
          parts[currentArgIndex + 1] = suggestion.id;
          textInputValue = '/' + parts.join(' ') + ' ';
        } else if (itemSuggestions.length === 1) {
          // Auto-complete if only one suggestion
          const suggestion = itemSuggestions[0];
          const parts = textInputValue.slice(1).split(' ');
          parts[currentArgIndex + 1] = suggestion.id;
          textInputValue = '/' + parts.join(' ') + ' ';
        }
        itemSuggestions = [];
        selectedItemIndex = -1;
        updateCommandSuggestions();
      } else if (commandSuggestions.length > 0) {
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < commandSuggestions.length) {
          // Complete with selected suggestion
          const suggestion = commandSuggestions[selectedSuggestionIndex];
          textInputValue = '/' + suggestion.cmd + ' ';
        } else if (commandSuggestions.length === 1) {
          // Auto-complete if only one suggestion
          textInputValue = '/' + commandSuggestions[0].cmd + ' ';
        }
        commandSuggestions = [];
        selectedSuggestionIndex = -1;
        updateCommandSuggestions();
      }
      e.preventDefault();
      return;
    }
    
    return;
  }
  
  if (e.code === keybinds.inventory) {
    const uiOpen = inventoryOpen || !!openContainer;
    if (uiOpen) {
      inventoryOpen = false;
      openContainer = null;
      if (draggingStack) {
        if (draggingStack.type === 'block') {
          const leftover = inventory.addBlock(draggingStack.blockId, draggingStack.count);
          draggingStack = leftover > 0 ? draggingStack : null;
        } else {
          let placed = false;
          for (let i = 0; i < inventory.TOTAL_SLOTS && draggingStack && draggingStack.count > 0; i++) {
            const s = inventory.slots[i];
            if (s && inventory.canMerge(s, draggingStack) && s.count < (s.maxStack ?? 64)) {
              const room = (s.maxStack ?? 64) - s.count;
              const take = Math.min(room, draggingStack.count);
              s.count += take;
              draggingStack.count -= take;
              placed = true;
            }
          }
          if (draggingStack && draggingStack.count > 0) {
            for (let i = 0; i < inventory.TOTAL_SLOTS && draggingStack && draggingStack.count > 0; i++) {
              if (!inventory.slots[i]) {
                inventory.slots[i] = draggingStack;
                draggingStack = null;
                placed = true;
                break;
              }
            }
          }
        }
      }
      if (!draggingStack || draggingStack.count <= 0) draggingStack = null;
      recomputeCraft();
    } else {
      inventoryOpen = true;
      recomputeCraft();
    }
  }
  if (e.code === 'Escape') {
    inventoryOpen = false;
    openContainer = null;
    draggingStack = null;
    recomputeCraft();
  }
  if (e.code === keybinds.chat || e.code === 'Slash') {
    textInputMode = true;
    if (typeof window !== 'undefined') {
      window.textInputMode = true;
    }
    textInputValue = e.code === 'Slash' ? '/' : '';
    if (e.code === 'Slash') {
      updateCommandSuggestions(); // Initialize suggestions when "/" is pressed
    }
    e.preventDefault();
  }
  if (e.code.startsWith('Digit')) {
    const idx = parseInt(e.code.replace('Digit', ''), 10) - 1;
    if (!Number.isNaN(idx) && idx >= 0 && idx < 9) {
      selectedIndex = idx;
    }
  }

if (e.code === keybinds.pause) {
  // Only allow pause menu if we're actually in-game (not in main menu)
  if (world && player && !isLoading) {
  if (gamePaused) {
    // Resume game
    gamePaused = false;
    if (window.renderer && window.renderer.getUI) {
      const ui = window.renderer.getUI();
      ui.gamePaused = false;
    }
      // Hide pause menu
      if (menuManager) {
        menuManager.resumeGame();
    }
  } else {
    // Pause game
    gamePaused = true;
    if (window.renderer && window.renderer.getUI) {
      const ui = window.renderer.getUI();
      ui.gamePaused = true;
    }
    // Show pause menu
    if (menuManager) {
      menuManager.showPauseMenu();
      }
    }
  }
}
  if (e.code === keybinds.background) {
    backgroundBuild = !backgroundBuild;
  }
if (e.code === 'BracketLeft') {
  CHUNK_RENDER_DISTANCE = Math.max(0, CHUNK_RENDER_DISTANCE - 1);
}
if (e.code === 'BracketRight') {
  CHUNK_RENDER_DISTANCE = Math.min(32, CHUNK_RENDER_DISTANCE + 1);
}
  if (e.code === keybinds.drop) {
    throwSelectedBlock();
  }

  if (e.code === 'KeyP') {
    showOutline = !showOutline;
  }
  if (e.code === keybinds.sprint || e.code === 'ShiftRight') {
    if (inventoryOpen || openContainer) {
      if (craftOutput && craftMatch) {
        let craftedCount = 0;
        const maxCraftable = 64;
        for (let i = 0; i < maxCraftable; i++) {
          if (consumeCraftInputs(craftMatch)) {
            craftedCount += craftOutput.count;
          } else {
            break;
          }
        }
        
        if (craftedCount > 0) {
          const craftedStack = { ...craftOutput, count: craftedCount };
          
          if (craftedStack.type === 'block') {
            inventory.addBlock(craftedStack.blockId, craftedStack.count);
          } else if (craftedStack.type === 'item') {
            inventory.addItem(craftedStack.itemId, craftedStack.count);
          }
          
          recomputeCraft();
        }
      }
    }
  }
});

window.addEventListener('keypress', (e) => {
  if (textInputMode && e.key.length === 1) {
    textInputValue += e.key;
    updateCommandSuggestions();
  }
});

// Renderer will be initialized when world is created


// Renderer will be available when world is created

// Engine initialization moved to createWorld function
// This will be initialized when a world is created

// Create a temporary stub to prevent errors before world creation
if (!engine) {
  engine = {
    start: () => {},
    stop: () => {}
  };
}

function initializeGameEngine() {
engine = new Engine((dt, time) => {
  // Check if game is in menu state or paused
  if (gamePaused) {
    return; // Skip all updates when in menu or paused
  }
  
  // Check if world exists (user hasn't created a world yet)
  if (!world) {
    return; // Skip all updates when no world exists
  }
  
  // Only update world time if it hasn't been manually set via /time command
  // We'll use a flag to track if time was manually set
  const oldTime = world.time;
  if (!world.timeManuallySet) {
    // Use the initial random time as a base and add the elapsed time
    world.time = (randomTime * world.dayLength) + (time * gameSpeed);
  }
  
  // Update lighting when time changes significantly (day/night transitions)
  if (!world._lastTimeUpdate) world._lastTimeUpdate = 0;
  const timeOfDay = (world.time % world.dayLength) / world.dayLength;
  const lastTimeOfDay = (oldTime % world.dayLength) / world.dayLength;
  const timeDiff = Math.abs(timeOfDay - lastTimeOfDay);
  if (timeDiff > 0.1 || time - world._lastTimeUpdate > 300) { // Update on significant time changes or every 5 seconds
    // Calculate sky light first
    world.calculateSkyLight();
    
    // Then calculate block light sources - this will override sky light where needed
    world.calculateBlockLight();
    
    // Finally propagate all light
    world.propagateLight();
    world._lastTimeUpdate = time;
  }
  if (!inventoryOpen && !openContainer && world && player) {
    player.update(input, dt, time, noClipMode, creativeMode);
  }
  
  

  const uiOpen = inventoryOpen || !!openContainer;
  
  // Handle continuous swing for ANY mouse button held
  if ((input.mouse.leftDown || input.mouse.rightDown) && !uiOpen && world) {
    // ALWAYS start continuous swing when any button is held
    if (!player.swingAnimation.active || !player.swingAnimation.continuous) {
      player.startContinuousSwing(world.time);
    }
  } else {
    // Stop continuous swing only when NO buttons are held
    if (player.swingAnimation.continuous) {
      player.stopSwing();
    }
  }
  
  if (input.mouse.leftDown && !uiOpen && world) {
    let { tileX, tileY } = getMouseTileFromRaw(input.mouse.x, input.mouse.y);
    
    if (world.inBounds(tileX, tileY)) {
      const heldItem = inventory.getSlot(selectedIndex);
      const wasActive = breaker.state.active;
      const prevX = breaker.state.x;
      const prevY = breaker.state.y;
      
      breaker.begin(world, tileX, tileY, creativeMode, heldItem);
    } else {
      breaker.cancel();
      // Don't stop swing here - let the continuous swing logic handle it
    }
  } else {
    breaker.cancel();
    // Don't stop swing here - let the continuous swing logic handle it
  }

  const broke = world ? breaker.update(world, dt * gameSpeed) : null;
    if (broke && broke.id && world) {
    const itemX = broke.x * TILE_SIZE + TILE_SIZE / 2;
    const itemY = (broke.y + 0.5) * TILE_SIZE;
    const itemEntity = new ItemEntity(broke.id, itemX, itemY, world.time);
    if (items.length < ItemEntity.getConfig().maxItems) {
      items.push(itemEntity);
    }

    if (broke.id === 'chest' && broke.meta && Array.isArray(broke.meta.inv)) {
      let itemIndex = 0;
      for (const stack of broke.meta.inv) {
        if (stack && stack.type === 'block' && stack.count > 0) {
          for (let i = 0; i < stack.count; i++) {
            const seedValue = (broke.x * 31 + broke.y * 17 + itemIndex * 13 + currentSeed) % 1000;
            const rx = broke.x * TILE_SIZE + TILE_SIZE / 2 + ((seedValue / 1000) - 0.5) * TILE_SIZE * 0.6;
            const ry = (broke.y + 0.5) * TILE_SIZE + (((seedValue * 17) % 1000) / 1000 - 0.5) * TILE_SIZE * 0.6;
            const chestItemEntity = new ItemEntity(stack.blockId, rx, ry, world.time);
            if (items.length < ItemEntity.getConfig().maxItems) {
              items.push(chestItemEntity);
            }
            itemIndex++;
          }
        }
      }
    }

    if (world) {
      world.setBlock(broke.x, broke.y, 'air', null);
      world.updateLighting(broke.x, broke.y);
      
      // Sync block breaking in multiplayer
      if (window.hostedRoom || window.multiplayerConnection) {
        menuManager.syncBlockChange(broke.x, broke.y, 'air', null);
      }
    }

    if (openContainer && openContainer.tileX === broke.x && openContainer.tileY === broke.y) {
      openContainer = null;
    }
  }

  // Clean up excess items if we have too many
  if (items.length > ItemEntity.getConfig().maxItems) {
    items.splice(0, items.length - ItemEntity.getConfig().maxItems);
  }

  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const shouldRemove = item.update(world.time, world, player);

    if (item.readyForPickup && !inventoryOpen && !openContainer) {
      const playerCenterX = player.x + player.width / 2;
      const playerCenterY = player.y + player.height / 2;
      const itemCenterX = item.x + item.width / 2;
      const itemCenterY = item.y + item.height / 2;
      const distance = Math.sqrt(
        Math.pow(playerCenterX - itemCenterX, 2) + 
        Math.pow(playerCenterY - itemCenterY, 2)
      );
      if (distance < ItemEntity.getConfig().pickupRange) {
        let leftover = 0;
        if (item.blockId) {
          leftover = inventory.addBlock(item.blockId, 1);
        } else if (item.itemId) {
          leftover = inventory.addItem(item.itemId, 1);
        }
        
        // If there's leftover, spit it out as a new item entity
        if (leftover > 0 && items.length < ItemEntity.getConfig().maxItems) {
          const dropped = new ItemEntity(
            item.blockId || item.itemId, 
            item.x, 
            item.y, 
            world.time
          );
          dropped.count = leftover;
          items.push(dropped);
        }
        
        items.splice(i, 1);
        continue;
      }
    }
    if (shouldRemove) {
      items.splice(i, 1);
    }
  }

  for (let i = leafParticles.length - 1; i >= 0; i--) {
    const particle = leafParticles[i];
    const shouldRemove = particle.update(world.time, world);
    
    if (shouldRemove) {
      leafParticles.splice(i, 1);
    }
  }

  // Update bees
  for (let i = bees.length - 1; i >= 0; i--) {
    const bee = bees[i];
    const shouldRemove = bee.update(world.time, world);
    
    if (shouldRemove) {
      bees.splice(i, 1);
    }
  }

  // Spawn new bees in groups occasionally
  if (Math.random() < 0.0008 && bees.length < 8) { // Reduced spawn chance and max bees
    const spawnX = Math.random() * world.width * TILE_SIZE;
    const spawnY = Math.random() * world.height * TILE_SIZE * 0.4; // Spawn in upper 40%
    
    // Spawn a group of bees
    const groupSize = Math.floor(Math.random() * 2) + 1; // 1-2 bees per group
    for (let i = 0; i < groupSize && bees.length < 8; i++) {
      const offsetX = (Math.random() - 0.5) * BEE_CONFIG.groupRadius;
      const offsetY = (Math.random() - 0.5) * BEE_CONFIG.groupRadius;
      const bee = new Bee(spawnX + offsetX, spawnY + offsetY, world.time);
      bees.push(bee);
    }
  }



  const playerTileX = Math.floor((player.x + player.width / 2) / TILE_SIZE);
  const playerTileY = Math.floor((player.y + player.height / 2) / TILE_SIZE);
  
  const baseChance = 0.001;
  let spawnChance = baseChance;
  
  const radius = 20;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tileX = playerTileX + dx;
      const tileY = playerTileY + dy;

      if (!world.inBounds(tileX, tileY)) continue;

      const chunkX = Math.floor(tileX / Math.max(1, world.chunkSize));
      if (!world.isChunkLoaded(chunkX)) continue;

      const blockId = world.getBlockId(tileX, tileY);
      if (blockId && blockId.endsWith('_leaves')) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        const distanceFactor = Math.max(0, 1 - (distance / radius));
        spawnChance = Math.max(spawnChance, baseChance + (0.0001 * distanceFactor));

        if (Math.random() < spawnChance) {
          const particleX = (tileX + 0.5) * TILE_SIZE + (Math.random() - 0.5) * TILE_SIZE * 0.8;
          const particleY = (tileY + 1.1) * TILE_SIZE;
          const tintFactor = 0.8 + Math.random() * 0.4;
          const particle = new LeafParticle(blockId, particleX, particleY, world.time, tintFactor);
          leafParticles.push(particle);
          spawnChance = baseChance;
        }
      }
    }
  }

  if (openContainer && world) {
    const blockId = world.getBlockId(openContainer.tileX, openContainer.tileY);
    if (blockId !== 'chest' && blockId !== 'crafting_table') {
      openContainer = null;
    }
  }
  
  // Only update world if it exists (user has created a world)
  if (world) {
    world.tick(dt * gameSpeed, time * gameSpeed);
    if (player) {
      const head = player.getHeadAnchor();
      const mouseWorldX = camera.screenToWorldX(input.mouse.x);
      const mouseWorldY = camera.screenToWorldY(input.mouse.y);
      const bias = 0.35;
      const targetX = head.x * (1 - bias) + mouseWorldX * bias;
      const targetY = head.y * (1 - bias) + mouseWorldY * bias;
      if (!inventoryOpen && !openContainer) {
        camera.followTo(targetX, targetY, canvas, world);
      }
    }
  }

  // Only preload chunks if world exists and game is running
  if (world) {
    (function backgroundPreload() {
      try {
        const now = Date.now();
        if (!window._lastChunkPreload) window._lastChunkPreload = 0;
        const MIN_PRELOAD_MS = 150;
        if (now - window._lastChunkPreload < MIN_PRELOAD_MS) return;
        window._lastChunkPreload = now;

        const playerTileXNow = Math.floor((player.x + player.width / 2) / TILE_SIZE);
        const centerChunk = Math.floor(playerTileXNow / Math.max(1, world.chunkSize));

        if (window._lastPlayerChunk === centerChunk) return;
        window._lastPlayerChunk = centerChunk;

        const dist = Math.max(0, Math.floor(CHUNK_RENDER_DISTANCE));
        const minChunk = Math.max(0, centerChunk - dist);
        const maxChunk = Math.min(Math.floor((world.width - 1) / Math.max(1, world.chunkSize)), centerChunk + dist);

        for (const key of Array.from(world.chunks.keys())) {
          const cx = parseInt(key, 10);
          if (cx < minChunk || cx > maxChunk) {
            try { world.unloadChunk(cx); } catch (err) { }
          }
        }

        const chunksToLoad = [];
        for (let cx = minChunk; cx <= maxChunk; cx++) {
          if (!world.isChunkLoaded(cx)) {
            chunksToLoad.push(cx);
          }
        }
        chunksToLoad.sort((a, b) => Math.abs(a - centerChunk) - Math.abs(b - centerChunk));

        for (const cx of chunksToLoad) {
          try {
            world.loadChunkAsync(cx).then((chunk) => {
              try { restoreSavedEntities(cx); } catch (e) { }
              // Update lighting for newly loaded chunk
              // Calculate sky light first
              world.calculateSkyLight();
              
              // Then calculate block light sources - this will override sky light where needed
              world.calculateBlockLight();
              
              // Finally propagate all light
              world.propagateLight();
            }).catch(() => { });
          } catch (err) {
          }
        }
      } catch (err) {
      }
    })();
  }
}, () => {
  renderer.render();
});

engine.start();
}

// Make engine globally accessible for mods
window.engine = engine;
