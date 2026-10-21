// Every menu screen: title, worlds, multiplayer, options, player, mods and the pause menu.
import { wind, DEFAULT_WIND } from '../core/wind.js';
import { weather } from '../core/weather.js';
import { gameClock } from '../core/gameClock.js';
import { World } from '../core/world.js';
import { Player } from '../entities/player.js';
import { TILE_SIZE } from '../core/utils.js';
import { DimensionManager, getDimension, applyDimension } from '../core/dimensions.js';
import { GAME_VERSION } from '../game/version.js';
import {
  worldSuperflatLayers,
  applyAppSettings,
  setBrowserFullscreen,
  setAppIcon,
  setGuiScale,
  setRenderScale,
  renderScale,
  saveBackgroundConfig,
  DEFAULT_KEYBINDS,
  keybinds,
  setPerfOverlay,
  saveGameSettings,
  saveKeybinds,
  syncSliderFill,
  RENDER_DISTANCE_CHUNKS,
  setRenderDistance
} from '../game/settings.js';
import { isTouchDevice } from './touchControls.js';
import { closeCommandMenu } from './commandMenu.js';
import { stopRecording } from './cameraCapture.js';
import { musicTracks, updateMusicVolume, switchMusicTrack, updateMusicTrackSelection, setMusicContext, setMenuMusic, syncMusic } from './music.js';
import { game, leafParticles, explosionFX, primedExplosives, tpVisited, saveManager, prefs } from '../game/state.js';
import { multiplayer } from '../game/net.js';
import { playerName, applyLocalSkin, drawSkinView, savedSkins, setSavedSkins, playerSkin, playerColor, setPlayerName } from '../game/players.js';
import { showToast } from './chatLog.js';
import { registry } from '../game/content.js';
import { warmIcons } from './iconPolish.js';
import { startMenuLoop, getRendererUI, initializeGameEngine } from '../game/loop.js';
import {
  findSurfaceY,
  placePlayerAtSurface,
  loadInitialChunks,
  ensurePlayerNotInSolid,
  wireWorld,
  enterWorld,
  getSaveState,
  saveCurrentWorld
} from '../game/session.js';
import { dropStackAtPlayer, closeInventory, updateHTMLUI } from './inventoryUI.js';
import { closeChat } from '../game/commands.js';

// A text seed as a number (a 31-bit string hash).
function textSeed(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return Math.abs(h) % 2147483647;
}

// Shows each < value > picker's setting, and greys out an arrow at its limit.
function syncSteppers() {
  document.querySelectorAll('.stepper[data-stepper]').forEach((stepper) => {
    const value = game[stepper.dataset.stepper];
    stepper.querySelector('.stepper-value').textContent = value;
    stepper.querySelector('[data-step="-1"]').disabled = value <= Number(stepper.dataset.min);
    stepper.querySelector('[data-step="1"]').disabled = value >= Number(stepper.dataset.max);
  });
}

export class MenuManager {
  constructor() {
    this.currentMenu = 'mainMenu';
    this.initializeMenus();
    this.bindEvents();
  }

  initializeMenus() {
    document.querySelectorAll('.menu-container').forEach((menu) => {
      menu.classList.add('hidden');
    });
    this.pinMenuButtons();
    document.getElementById('mainMenu').classList.remove('hidden');

    const healthDisplay = document.getElementById('healthDisplay');
    const hungerDisplay = document.getElementById('hungerDisplay');
    if (healthDisplay) healthDisplay.classList.add('hidden');
    if (hungerDisplay) hungerDisplay.classList.add('hidden');

    this.updateVersionNumber();
  }

  // The textures and icons a world needs, loaded once. Started as soon as you head towards a
  // world (Single Player, Multiplayer), so entering one rarely has to wait for them.
  prepareWorldAssets() {
    if (!this._worldAssets) {
      this._worldAssets = game.renderer.loadWorldTextures();
      // Every block and item icon, polished before the inventory is first opened.
      warmIcons([...registry.entries()].filter(([, d]) => !d.hidden).map(([id]) => `assets/textures/${id}.png`));
    }
    return this._worldAssets;
  }

  showMenu(menuId) {
    if (menuId === 'singlePlayerMenu' || menuId === 'multiplayerMenu') this.prepareWorldAssets();
    document.querySelectorAll('.menu-container').forEach((menu) => menu.classList.add('hidden'));
    const menu = menuId && document.getElementById(menuId);
    if (menu) menu.classList.remove('hidden');
    document.body.classList.toggle('game-paused', !!(game.world && game.gamePaused));
    this.currentMenu = menuId;
    if (menu) menu.querySelectorAll('.minecraft-slider').forEach(syncSliderFill);
  }

  // Menus ending in a row of buttons (Back, Apply...): everything between the title and that
  // row goes in a scroll area, so a tall menu scrolls its options and the buttons stay in view.
  pinMenuButtons() {
    document.querySelectorAll('.menu-content').forEach((content) => {
      const last = content.lastElementChild;
      if (!last?.classList.contains('menu-buttons') || content.querySelector(':scope > .menu-scroll')) return;
      const body = [...content.children].filter((el) => el !== last && !el.classList.contains('menu-title'));
      if (!body.length) return;
      const scroll = document.createElement('div');
      scroll.className = 'menu-scroll';
      content.insertBefore(scroll, body[0]);
      for (const el of body) scroll.appendChild(el);
      content.classList.add('pinned-buttons');
    });
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
        this.pendingHost = null;
        this.showMenu('singlePlayerMenu');
        break;
      case 'sp-new-world':
        this.pendingHost = null;
        this.showMenu('createWorldMenu');
        break;
      case 'create-world-back':
        // Back to wherever the new world was started from.
        this.showMenu(this.pendingHost ? 'mpCreateMenu' : 'singlePlayerMenu');
        this.pendingHost = null;
        break;
      case 'pause-exit':
        // In someone else's world there's nothing of yours to save: just leave.
        if (multiplayer.isGuest) this.showMainMenu(true);
        else this.showMenu('exitMenu');
        break;
      case 'exit-back':
        this.showMenu('pauseMenu');
        break;
      case 'pause-players':
        this.showPlayersMenu();
        break;
      case 'player-perm':
        multiplayer.setPermission(Number(button.dataset.id), button.dataset.perm, button.dataset.value === 'on');
        this.showPlayersMenu();
        break;
      case 'player-kick':
        multiplayer.kick(Number(button.dataset.id));
        this.showPlayersMenu();
        break;
      case 'player-ban':
        multiplayer.ban(button.dataset.name);
        this.showPlayersMenu();
        break;
      case 'player-unban':
        multiplayer.unban(button.dataset.name);
        this.showPlayersMenu();
        break;
      case 'exit-no-save':
        this.showMainMenu(false);
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
      case 'player-options':
        this.showPlayerOptions();
        break;
      case 'player-import-skin':
        document.getElementById('playerSkinFile')?.click();
        break;
      case 'player-done':
        this.savePlayerName();
        this.showMenu(game.world ? (game.gamePaused ? 'pauseMenu' : null) : 'mainMenu');
        break;
      case 'app-options':
        this.showAppOptions();
        break;
      case 'app-controls':
        prefs.set('appWindowControls', button.dataset.value === 'on');
        applyAppSettings();
        this.showAppOptions();
        break;
      case 'app-ui-mode':
        prefs.set('uiMode', button.dataset.value);
        // The touch UI is built at startup, so the page reloads to switch (in a world, on returning to the title).
        if (!game.world) location.reload();
        else this.showAppOptions();
        break;
      case 'app-gpu':
        // main.js reads this at startup (it also turns it off itself if the screen stays black).
        prefs.set('disableGpu', button.dataset.value === 'off');
        this.showAppOptions();
        break;
      case 'app-fullscreen':
        prefs.set('appFullscreen', button.dataset.value === 'on');
        if (window.electronAPI?.app) window.electronAPI.app.setFullscreen(button.dataset.value === 'on');
        else setBrowserFullscreen(button.dataset.value === 'on');
        this.showAppOptions();
        break;
      case 'multiplayer':
        multiplayer.stopBrowsing();
        this.showMenu('multiplayerMenu');
        break;
      case 'mp-create':
        this.showMpCreate();
        break;
      case 'mp-join':
        this.showMpJoin();
        break;
      case 'mp-join-back':
        multiplayer.stopBrowsing();
        this.showMenu('multiplayerMenu');
        break;
      case 'mp-max':
      case 'mp-build':
      case 'mp-lan':
        button.parentElement.querySelectorAll('.minecraft-button').forEach((b) => b.removeAttribute('data-selected'));
        button.setAttribute('data-selected', 'true');
        break;
      case 'mp-start-host':
        this.startHosting();
        break;
      case 'mp-join-address':
        this.joinAddress();
        break;
      case 'quit':
        if (window.electronAPI?.window) window.electronAPI.window.close();
        else window.close();
        break;
      case 'changelog':
        this.showMenu('changelogMenu');
        break;
      case 'info-tab':
        document.querySelectorAll('.info-tab').forEach((t) => t.removeAttribute('data-selected'));
        button.setAttribute('data-selected', 'true');
        document.querySelectorAll('.info-panel').forEach((p) => p.classList.add('hidden'));
        document.querySelector(`.info-panel[data-panel="${button.dataset.tab}"]`)?.classList.remove('hidden');
        break;
      case 'create-world':
        this.createWorld();
        break;

      case 'back-to-main':
        this.showMenu(game.world && game.gamePaused ? 'pauseMenu' : 'mainMenu');
        break;
      case 'graphics-options':
        this.showMenu('graphicsOptionsMenu');
        this.markGuiScale();
        break;
      case 'gui-scale':
        setGuiScale(Number(button.dataset.value));
        this.markGuiScale();
        break;
      case 'render-scale':
        setRenderScale(Number(button.dataset.value));
        this.markGuiScale();
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
        this.markTouchAimMode();
        break;
      case 'touch-aim':
        prefs.set('touchAimMode', button.dataset.value);
        this.markTouchAimMode();
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

      case 'game-mode-survival':
        this.updateButtonGroup(button, 'game-mode-survival', 'game-mode-creative');
        game.worldGameMode = 'survival';
        break;
      case 'game-mode-creative':
        this.updateButtonGroup(button, 'game-mode-survival', 'game-mode-creative');
        game.worldGameMode = 'creative';
        break;

      case 'world-type-regular':
        this.updateButtonGroup(button, 'world-type-regular', 'world-type-superflat', 'world-type-mountains');
        game.worldType = 'regular';
        break;
      case 'world-type-superflat':
        this.updateButtonGroup(button, 'world-type-regular', 'world-type-superflat', 'world-type-mountains');
        game.worldType = 'superflat';
        break;
      case 'world-type-mountains':
        this.updateButtonGroup(button, 'world-type-regular', 'world-type-superflat', 'world-type-mountains');
        game.worldType = 'mountains';
        break;

      case 'render-tiny':
      case 'render-short':
      case 'render-normal':
      case 'render-far':
      case 'render-extreme':
        this.updateButtonGroup(button, 'render-tiny', 'render-short', 'render-normal', 'render-far', 'render-extreme');
        game.renderDistance = action.slice('render-'.length);
        setRenderDistance(RENDER_DISTANCE_CHUNKS[game.renderDistance]);
        saveGameSettings();
        break;


      case 'menu-music-on':
      case 'menu-music-off':
        this.updateButtonGroup(button, 'menu-music-on', 'menu-music-off');
        setMenuMusic(action === 'menu-music-on');
        break;

      case 'auto-jump-on':
        this.updateButtonGroup(button, 'auto-jump-on', 'auto-jump-off');
        game.autoJump = true;
        saveGameSettings();
        break;
      case 'auto-jump-off':
        this.updateButtonGroup(button, 'auto-jump-on', 'auto-jump-off');
        game.autoJump = false;
        saveGameSettings();
        break;

      case 'leaves-on':
        this.updateButtonGroup(button, 'leaves-on', 'leaves-off');
        game.renderFallingLeaves = true;
        saveGameSettings();
        break;
      case 'leaves-off':
        this.updateButtonGroup(button, 'leaves-on', 'leaves-off');
        game.renderFallingLeaves = false;
        leafParticles.length = 0;
        saveGameSettings();
        break;

      case 'perf-overlay-on':
      case 'perf-overlay-off':
        setPerfOverlay(action === 'perf-overlay-on');
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
      case 'bind-outline':
      case 'bind-zoomOut':
      case 'bind-zoomIn':
      case 'bind-renderLess':
      case 'bind-renderMore':
      case 'bind-perf':
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
        game.worldSize = 'tiny';
        break;
      case 'world-size-small':
        this.updateButtonGroup(button, 'world-size-tiny', 'world-size-small', 'world-size-normal', 'world-size-large');
        game.worldSize = 'small';
        break;
      case 'world-size-normal':
        this.updateButtonGroup(button, 'world-size-tiny', 'world-size-small', 'world-size-normal', 'world-size-large');
        game.worldSize = 'normal';
        break;
      case 'world-size-large':
        this.updateButtonGroup(button, 'world-size-tiny', 'world-size-small', 'world-size-normal', 'world-size-large');
        game.worldSize = 'large';
        break;

      case 'time-day':
        this.updateButtonGroup(button, 'time-day', 'time-night', 'time-sunset', 'time-dawn');
        game.worldStartingTime = 'day';
        break;
      case 'time-night':
        this.updateButtonGroup(button, 'time-day', 'time-night', 'time-sunset', 'time-dawn');
        game.worldStartingTime = 'night';
        break;
      case 'time-sunset':
        this.updateButtonGroup(button, 'time-day', 'time-night', 'time-sunset', 'time-dawn');
        game.worldStartingTime = 'sunset';
        break;
      case 'time-dawn':
        this.updateButtonGroup(button, 'time-day', 'time-night', 'time-sunset', 'time-dawn');
        game.worldStartingTime = 'dawn';
        break;

      case 'difficulty-peaceful':
        this.updateButtonGroup(button, 'difficulty-peaceful', 'difficulty-easy', 'difficulty-normal', 'difficulty-hard');
        game.worldDifficulty = 'peaceful';
        break;
      case 'difficulty-easy':
        this.updateButtonGroup(button, 'difficulty-peaceful', 'difficulty-easy', 'difficulty-normal', 'difficulty-hard');
        game.worldDifficulty = 'easy';
        break;
      case 'difficulty-normal':
        this.updateButtonGroup(button, 'difficulty-peaceful', 'difficulty-easy', 'difficulty-normal', 'difficulty-hard');
        game.worldDifficulty = 'normal';
        break;
      case 'difficulty-hard':
        this.updateButtonGroup(button, 'difficulty-peaceful', 'difficulty-easy', 'difficulty-normal', 'difficulty-hard');
        game.worldDifficulty = 'hard';
        break;

      case 'cheats-on':
        this.updateButtonGroup(button, 'cheats-on', 'cheats-off');
        game.worldCheatsEnabled = true;
        break;
      case 'cheats-off':
        this.updateButtonGroup(button, 'cheats-on', 'cheats-off');
        game.worldCheatsEnabled = false;
        break;

      case 'commands-on':
        this.updateButtonGroup(button, 'commands-on', 'commands-off');
        game.worldAllowCommands = true;
        break;
      case 'commands-off':
        this.updateButtonGroup(button, 'commands-on', 'commands-off');
        game.worldAllowCommands = false;
        break;

      case 'stepper': {
        // < value > pickers: step the game setting they name, kept within their limits.
        const stepper = button.closest('.stepper');
        const key = stepper.dataset.stepper;
        const value = game[key] + Number(button.dataset.step);
        game[key] = Math.max(Number(stepper.dataset.min), Math.min(Number(stepper.dataset.max), value));
        syncSteppers();
        break;
      }

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
    }
  }

  updateButtonGroup(clickedButton, ...buttonActions) {
    buttonActions.forEach((action) => {
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
        game.worldName = e.target.value;
      });
    }

    this.initializeKeybindButtons();

    const worldSeedInput = document.getElementById('worldSeed');
    if (worldSeedInput) {
      worldSeedInput.addEventListener('input', (e) => {
        game.worldSeed = e.target.value;
      });
    }

    if (worldNameInput) worldNameInput.value = game.worldName;
    if (worldSeedInput) worldSeedInput.value = game.worldSeed;

    syncSteppers();
  }

  bindSliders() {
    document.querySelectorAll('.minecraft-slider').forEach((slider) => {
      slider.addEventListener('input', () => syncSliderFill(slider));
    });

    const masterVolumeSlider = document.getElementById('masterVolume');
    const masterVolumeValue = document.getElementById('masterVolumeValue');
    if (masterVolumeSlider && masterVolumeValue) {
      masterVolumeSlider.addEventListener('input', (e) => {
        game.masterVolume = parseInt(e.target.value);
        masterVolumeValue.textContent = game.masterVolume;
        updateMusicVolume();

        prefs.set('underwild_masterVolume', game.masterVolume);
      });
    }

    const musicVolumeSlider = document.getElementById('musicVolume');
    const musicVolumeValue = document.getElementById('musicVolumeValue');
    if (musicVolumeSlider && musicVolumeValue) {
      musicVolumeSlider.addEventListener('input', (e) => {
        game.musicVolume = parseInt(e.target.value);
        musicVolumeValue.textContent = game.musicVolume;
        updateMusicVolume();

        prefs.set('underwild_musicVolume', game.musicVolume);
      });
    }

    const sfxVolumeSlider = document.getElementById('sfxVolume');
    const sfxVolumeValue = document.getElementById('sfxVolumeValue');
    if (sfxVolumeSlider && sfxVolumeValue) {
      sfxVolumeSlider.addEventListener('input', (e) => {
        game.sfxVolume = parseInt(e.target.value);
        sfxVolumeValue.textContent = game.sfxVolume;
        prefs.set('underwild_sfxVolume', game.sfxVolume);
      });
    }

    const musicTrackItems = document.querySelectorAll('.music-track-item');
    if (musicTrackItems.length > 0) {
      updateMusicTrackSelection();

      musicTrackItems.forEach((item) => {
        item.addEventListener('click', () => {
          const trackId = item.getAttribute('data-track');
          if (musicTracks[trackId]) {
            switchMusicTrack(trackId);
            updateMusicTrackSelection();
          }
        });
      });
    }
  }

  resetSessionState() {
    // Every dimension visited has its own world (and chunk worker) to shut down.
    for (const w of new Set([game.world, ...(game.dimensionManager?.dimensions.values() || [])])) w?.dispose();
    game.world = null;
    game.player = null;
    game.items.length = 0;
    leafParticles.length = 0;
    explosionFX.clear();
    primedExplosives.length = 0;
    game.inventory.clear();
    game.inventoryCraftGrid.fill(null);
    game.craftGrid.fill(null);
    game.craftOutput = null;
    game.craftMatch = null;
    game.openContainer = null;
    game.draggingStack = null;
    game.inventoryOpen = false;
    game.gamePaused = false;
    game.noClipMode = false;
    game.gameSpeed = 1;
    game.setPosition1 = null;
    game.setPosition2 = null;
    game.selectedIndex = 0;
    game.lastPreloadChunk = null;
    tpVisited.clear();
    game.creativeCategoriesCache = null;
    game.renderedCreativeTab = null;
    game.breaker.cancel();
    game.dimensionManager = null;
    if (game.textInputMode) closeChat();
  }

  createSessionWorld(width, height, seed, worldType = 'regular') {
    game.world = new World(width, height, registry, seed);
    game.world.worldType = worldType;
    game.world.items = game.items;
    game.dimensionManager = new DimensionManager({
      seed,
      width,
      height,
      registry,
      initialWorld: game.world,
      initialWorldType: worldType
    });
    wireWorld(game.world);
    return game.world;
  }

  createSessionPlayer(x, y) {
    game.player = new Player(game.world, registry, x, y, playerName());
    game.player.keybinds = keybinds;
    game.player.autoJump = game.autoJump;
    game.player.fallDamageEnabled = !game.creativeMode;
    applyLocalSkin();
    return game.player;
  }

  attachRenderer() {
    game.renderer.world = game.world;
    game.renderer.player = game.player;
    game.renderer.inventory = game.inventory;
    game.renderer.breaker = game.breaker;
    game.renderer.getUI = getRendererUI;
  }

  async beginSession() {
    // The loading screen stays up until every texture is in, so no block is ever drawn without one.
    await this.prepareWorldAssets();
    document.querySelectorAll('.menu-container').forEach((menu) => menu.classList.add('hidden'));
    this.currentMenu = null;
    game.canvas.style.display = 'block';

    const head = game.player.getHeadAnchor();
    game.camera.followTo(head.x, head.y, game.canvas, game.world);

    saveManager.setWorldName(game.currentWorldSaveName);
    // No autosave: the world is saved only by Save and Exit (and when the window closes).

    initializeGameEngine();
    game.isLoading = false;
    game.engine.start();
    if (this.pendingHost) this.beginHosting();
    setTimeout(() => setMusicContext(true), 500);
  }

  failSession(message) {
    if (game.engine) game.engine.stop();
    startMenuLoop();
    game.isLoading = false;
    this.pendingHost = null;
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
    if (game.isLoading) return;
    game.isLoading = true;
    document.querySelectorAll('.menu-container').forEach((menu) => menu.classList.add('hidden'));

    try {
      this.resetSessionState();

      const trimmedSeed = String(game.worldSeed || '').trim();
      const parsedSeed = parseInt(trimmedSeed, 10);
      // A number is used as it is; any other text is turned into a number, so the same words
      // always give the same world.
      const isNumber = /^-?\d+$/.test(trimmedSeed);
      game.currentSeed = !trimmedSeed || trimmedSeed === 'Random' ? Math.floor(Math.random() * 1000000) : isNumber ? parsedSeed : textSeed(trimmedSeed);

      const sizeMap = { tiny: 500, small: 1000, normal: 2000, large: 4000 };
      this.createSessionWorld(sizeMap[game.worldSize] || 2000, 200, game.currentSeed, game.worldType || 'regular');
      game.world.worldType = game.worldType || 'regular';
      game.world.cheatsEnabled = game.worldCheatsEnabled;
      game.world.allowCommands = game.worldAllowCommands;
      game.world.difficulty = game.worldDifficulty;
      if (game.worldType === 'superflat') game.world.superflatLayers = worldSuperflatLayers.map((layer) => ({ ...layer }));

      game.creativeMode = game.worldGameMode === 'creative';
      game.world.creativeMode = game.creativeMode;

      const timeMap = { day: 0.5, night: 0.0, sunset: 0.75, dawn: 0.25 };
      game.world.time = (timeMap[game.worldStartingTime] ?? 0.5) * game.world.dayLength;
      wind.set(DEFAULT_WIND, true);
      weather.reset();
      gameClock.ms = 0;

      game.modManager?.initialize(registry, game.world);

      game.spawnTileX = Math.floor(game.world.width / 2);
      this.createSessionPlayer(game.spawnTileX * TILE_SIZE, 0);
      game.player.maxHealth = game.startingHealth;
      game.player.health = game.startingHealth;
      game.player.maxHunger = game.startingHunger;
      game.player.hunger = game.startingHunger;
      this.attachRenderer();

      await loadInitialChunks(game.spawnTileX);
      if (!game.world.isChunkLoaded(game.world.chunkXFor(game.spawnTileX))) throw new Error('Failed to load initial chunks');
      placePlayerAtSurface(game.spawnTileX);

      game.currentWorldSaveName = await this.getUniqueWorldName(game.worldName.trim() || 'New World');
      game.currentWorldDisplayName = game.currentWorldSaveName;
      this.beginSession();
      saveCurrentWorld();
    } catch (error) {
      console.error('Error creating world:', error);
      this.failSession(`Failed to create world: ${error.message}`);
    }
  }

  async loadSavedWorld(saveName) {
    if (!saveName || game.isLoading) return;
    game.isLoading = true;
    document.querySelectorAll('.menu-container').forEach((menu) => menu.classList.add('hidden'));

    try {
      const savedData = await saveManager.load(saveName);
      if (!savedData) throw new Error('Save file not found or unreadable.');

      this.resetSessionState();
      const { worldWidth, worldHeight, worldMeta, chunkData, dimensionsData, activeDimension, playerData, inventoryData, itemEntities, mpPlayers, displayName } = savedData;
      game.currentWorldDisplayName = displayName;

      game.currentSeed = worldMeta.currentSeed ?? worldMeta.seed ?? 0;
      game.worldGameMode = worldMeta.gameMode || 'survival';
      game.creativeMode = worldMeta.creativeMode ?? game.worldGameMode === 'creative';

      // Earth first (the save's top level), then whichever dimension the player was in.
      this.createSessionWorld(worldWidth, worldHeight, worldMeta.seed ?? game.currentSeed, worldMeta.worldType || 'regular');
      if (dimensionsData) game.dimensionManager.savedDimensionsData = dimensionsData;
      game.world.superflatLayers = worldMeta.superflatLayers || null;
      game.world.time = worldMeta.time || 0;
      gameClock.ms = worldMeta.clock || 0;
      game.world.timeManuallySet = !!worldMeta.timeManuallySet;
      wind.set(worldMeta.wind ?? DEFAULT_WIND, true);
      weather.reset();
      weather.set(worldMeta.weather || 'clear', true);
      weather.auto = worldMeta.weatherAuto ?? true;
      weather.snowCover = worldMeta.snowCover ?? 0;
      game.world.cheatsEnabled = !!worldMeta.cheatsEnabled;
      game.world.allowCommands = !!worldMeta.allowCommands;
      game.world.difficulty = worldMeta.difficulty || 'normal';
      game.world.creativeMode = game.creativeMode;
      game.world.mpPlayers = mpPlayers || {};

      const expectedLength = game.world.chunkSize * game.world.height;
      for (const [cx, cells] of chunkData) {
        if (cells.length === expectedLength) game.world._savedChunks.set(cx, cells);
      }
      for (const ent of itemEntities) {
        if (!ent.blockId) continue;
        const cx = game.world.chunkXFor(Math.floor(ent.x / TILE_SIZE));
        game.world._savedEntities.set(cx, (game.world._savedEntities.get(cx) || []).concat(ent));
      }
      const earthWorld = game.world;
      if (activeDimension && activeDimension !== 'earth' && getDimension(activeDimension)) {
        enterWorld(game.dimensionManager.getOrCreateDimension(activeDimension), earthWorld);
      }

      if (game.modManager) game.modManager.initialize(registry, game.world);

      game.spawnTileX = Math.floor(game.world.width / 2);
      this.createSessionPlayer(playerData.x ?? game.spawnTileX * TILE_SIZE, playerData.y ?? 0);
      game.player.maxHealth = playerData.maxHealth ?? game.player.maxHealth;
      game.player.health = playerData.health ?? game.player.maxHealth;
      game.player.maxHunger = playerData.maxHunger ?? game.player.maxHunger;
      game.player.hunger = playerData.hunger ?? game.player.maxHunger;
      game.player.creativeFlying = !!playerData.creativeFlying;
      game.player.isFlying = !!playerData.isFlying;

      const inventoryOverflow = game.inventory.deserialize(inventoryData);
      game.selectedIndex = Math.max(0, Math.min(8, playerData.selectedIndex ?? 0));

      this.attachRenderer();
      game.currentWorldSaveName = saveName;

      await loadInitialChunks(Math.floor(game.player.x / TILE_SIZE));
      ensurePlayerNotInSolid();
      for (const stack of inventoryOverflow || []) dropStackAtPlayer(stack);
      game.player.spawnPoint = { x: game.spawnTileX * TILE_SIZE, y: findSurfaceY(game.spawnTileX) * TILE_SIZE - game.player.height - 1 };

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
    if (titleEl) titleEl.textContent = 'Load World';
    document.getElementById('modsBackButton').dataset.action = 'single-player';

    modsGrid.innerHTML = '';
    if (worlds.length === 0) {
      modsGrid.innerHTML = '<div class="no-mods-message"><p>No saved worlds</p></div>';
      return;
    }

    // Most recently played first.
    worlds.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
    for (const w of worlds) {
      const saveName = w.fileName.replace(/\.json$/, '');
      const item = document.createElement('div');
      item.className = 'mod-grid-item world-item';
      item.innerHTML = `
        <div class="mod-thumbnail world-thumb">W</div>
        <div class="mod-info">
          <div class="mod-name"></div>
          <div class="mod-version"></div>
          <div class="mod-version world-date"></div>
        </div>
        <div class="world-actions">
          <button class="minecraft-button small world-rename" title="Rename">Rename</button>
          <button class="minecraft-button small world-delete" title="Delete">Delete</button>
        </div>
      `;
      item.querySelector('.mod-name').textContent = w.name || w.fileName;
      item.querySelector('.mod-version').textContent = `Seed: ${w.seed || 'Random'} | ${w.gameMode || 'survival'}`;
      item.querySelector('.world-date').textContent = w.modifiedAt ? `Played ${new Date(w.modifiedAt).toLocaleString()}` : '';
      item.addEventListener('click', (e) => {
        if (e.target.closest('.world-actions')) return;
        this.loadSavedWorld(saveName);
      });
      item.querySelector('.world-rename').addEventListener('click', () => this.renameWorld(saveName, w.name || saveName));
      item.querySelector('.world-delete').addEventListener('click', () => this.deleteWorld(saveName, w.name || saveName));
      modsGrid.appendChild(item);
    }
  }

  // Renames a world as shown in the list (its file keeps its name).
  async renameWorld(saveName, current) {
    const name = window.prompt('World name:', current);
    if (name == null || !name.trim()) return;
    try {
      const json = await window.electronAPI.worlds.load(saveName);
      if (!json) return;
      const data = JSON.parse(json);
      data.meta = { ...(data.meta || {}), displayName: name.trim().slice(0, 40) };
      await window.electronAPI.worlds.save(saveName, JSON.stringify(data));
    } catch (e) {
      console.error('Rename world failed:', e);
    }
    this.showWorldList();
  }

  async deleteWorld(saveName, label) {
    if (!window.confirm(`Delete "${label}"? This can't be undone.`)) return;
    await saveManager.deleteWorld(saveName);
    this.showWorldList();
  }

  // save = false leaves the world file as it was last saved.
  showMainMenu(save = true) {
    if (game.engine) game.engine.stop();
    setMusicContext(false);
    closeCommandMenu();
    stopRecording();
    startMenuLoop();
    multiplayer.stop(save);
    saveManager.stopAutoSave();
    const state = save ? getSaveState() : null;
    if (state) saveManager.saveSync(state.world, state.player, state.items, state.inventory, state.meta);
    game.currentWorldSaveName = null;
    saveManager.setWorldName(null);
    this.resetSessionState();
    game.renderer.world = null;
    game.renderer.player = null;
    this.showMenu('mainMenu');
    updateHTMLUI();
    // UI Layout was changed in the world: switch now that it's saved.
    if (document.body.classList.contains('touch-mode') !== isTouchDevice(prefs.get('uiMode') || 'auto')) location.reload();
  }

  // --- Multiplayer menus ---------------------------------------------------------------

  showNotice(text, title = 'Multiplayer') {
    document.getElementById('noticeTitle').textContent = title;
    document.getElementById('noticeText').textContent = text;
    this.showMenu('noticeMenu');
  }

  async showMpCreate() {
    this.showMenu('mpCreateMenu');
    const status = document.getElementById('mpCreateStatus');
    status.textContent = '';
    status.classList.remove('error');
    const list = document.getElementById('mpWorldList');
    list.innerHTML = '';
    const worlds = await saveManager.listWorlds();
    const entries = [{ fileName: null, name: 'New World', sub: '' }].concat(
      worlds.map((w) => ({
        fileName: w.fileName.replace(/\.json$/, ''),
        name: w.name || w.fileName,
        sub: `${w.gameMode === 'creative' ? 'Creative' : 'Survival'} | Seed ${w.seed}`
      }))
    );
    if (this.mpWorld === undefined) this.mpWorld = entries[1]?.fileName ?? null;
    for (const w of entries) {
      const item = document.createElement('div');
      item.className = 'mp-list-item' + (w.fileName === this.mpWorld ? ' selected' : '');
      item.innerHTML = `<div class="mp-list-icon">${w.fileName ? 'W' : '+'}</div><div class="mp-list-text"><span class="mp-list-name"></span><span class="mp-list-sub"></span></div>`;
      item.querySelector('.mp-list-name').textContent = w.name;
      item.querySelector('.mp-list-sub').textContent = w.sub;
      item.addEventListener('click', () => {
        this.mpWorld = w.fileName;
        list.querySelectorAll('.mp-list-item').forEach((el) => el.classList.remove('selected'));
        item.classList.add('selected');
      });
      list.appendChild(item);
    }
  }

  readHostSettings() {
    const pick = (id) => document.querySelector(`#${id} [data-selected="true"]`)?.dataset.value;
    return {
      maxPlayers: parseInt(pick('mpMaxPlayers') || '4', 10),
      allowBuild: pick('mpAllowBuild') !== 'off',
      lan: pick('mpLan') !== 'off'
    };
  }

  async startHosting() {
    if (!window.electronAPI?.mp) {
      this.showNotice('Multiplayer only works in the desktop app.');
      return;
    }
    const settings = this.readHostSettings();
    if (this.mpWorld) {
      this.pendingHost = settings;
      await this.loadSavedWorld(this.mpWorld);
    } else {
      // A new world: the normal Create World screen, then hosting starts once it's made.
      this.pendingHost = settings;
      this.showMenu('createWorldMenu');
    }
  }

  async beginHosting() {
    const settings = this.pendingHost;
    this.pendingHost = null;
    if (!settings) return;
    const res = await multiplayer.host(settings);
    if (!res.ok) {
      showToast(`Couldn't start the game: ${res.error}`);
      return;
    }
    const addresses = (res.addresses || []).join(', ');
    if (addresses) showToast(`Others can join at ${addresses}`);
  }

  showMpJoin() {
    this.showMenu('mpJoinMenu');
    const status = document.getElementById('mpJoinStatus');
    status.textContent = '';
    status.classList.remove('error');
    const list = document.getElementById('mpHostList');
    const draw = (hosts) => {
      list.innerHTML = '';
      if (!hosts.length) {
        list.innerHTML = '<div class="mp-empty">Looking for games...</div>';
        return;
      }
      for (const h of hosts) {
        const item = document.createElement('div');
        item.className = 'mp-list-item';
        item.innerHTML = `<div class="mp-list-icon">W</div><div class="mp-list-text"><span class="mp-list-name"></span><span class="mp-list-sub"></span></div><span class="mp-list-side"></span>`;
        item.querySelector('.mp-list-name').textContent = h.name || 'Game';
        item.querySelector('.mp-list-sub').textContent = `${h.host || '?'} | ${h.mode || ''}`;
        item.querySelector('.mp-list-side').textContent = `${h.players}/${h.max}`;
        item.addEventListener('click', () => this.joinGame(h.address, h.port));
        list.appendChild(item);
      }
    };
    draw([]);
    if (!window.electronAPI?.mp) {
      list.innerHTML = '<div class="mp-empty">Multiplayer works in the desktop and Android apps.</div>';
      return;
    }
    multiplayer.startBrowsing(draw);
  }

  joinAddress() {
    const raw = document.getElementById('mpAddress').value.trim();
    if (!raw) return;
    const [address, port] = raw.split(':');
    this.joinGame(address, port ? parseInt(port, 10) : undefined);
  }

  async joinGame(address, port) {
    if (this.joining) return;
    this.joining = true;
    const status = document.getElementById('mpJoinStatus');
    status.classList.remove('error');
    status.textContent = `Joining ${address}...`;
    multiplayer.stopBrowsing();
    const res = await multiplayer.join(address, port);
    this.joining = false;
    if (!res.ok) {
      // Loading may have hidden the menus; put the join screen back with the reason.
      if (!game.world) {
        this.showMpJoin();
        const st = document.getElementById('mpJoinStatus');
        st.textContent = res.error;
        st.classList.add('error');
      }
    }
  }

  // A guest's copy of the host's world: like loading a save, but nothing is saved here.
  async startGuestWorld(decoded, saved, spawn, serverName) {
    game.isLoading = true;
    document.querySelectorAll('.menu-container').forEach((menu) => menu.classList.add('hidden'));
    try {
      this.resetSessionState();
      const { worldWidth, worldHeight, worldMeta, activeDimension } = decoded;
      game.currentSeed = worldMeta.currentSeed ?? worldMeta.seed ?? 0;
      game.worldGameMode = worldMeta.gameMode || 'survival';
      game.creativeMode = worldMeta.creativeMode ?? game.worldGameMode === 'creative';

      // The guest gets a copy of just the world the host is in (Earth, or another dimension).
      const dim = activeDimension !== 'earth' ? decoded.dimensionsData.get(activeDimension) : null;
      const chunkData = dim ? dim.chunkData : decoded.chunkData;
      this.createSessionWorld(worldWidth, worldHeight, dim?.seed ?? worldMeta.seed ?? game.currentSeed, worldMeta.worldType || 'regular');
      if (dim) applyDimension(game.world, activeDimension);
      game.world.dimensionManager = null;
      game.dimensionManager = null;
      game.world.remote = true;
      game.world.superflatLayers = worldMeta.superflatLayers || null;
      game.world.time = worldMeta.time || 0;
      gameClock.ms = worldMeta.clock || 0;
      game.world.timeManuallySet = !!worldMeta.timeManuallySet;
      wind.set(worldMeta.wind ?? DEFAULT_WIND, true);
      weather.reset();
      weather.set(worldMeta.weather || 'clear', true);
      weather.auto = worldMeta.weatherAuto ?? true;
      weather.snowCover = worldMeta.snowCover ?? 0;
      game.world.cheatsEnabled = !!worldMeta.cheatsEnabled;
      game.world.allowCommands = !!worldMeta.allowCommands;
      game.world.difficulty = worldMeta.difficulty || 'normal';
      game.world.creativeMode = game.creativeMode;
      const expectedLength = game.world.chunkSize * game.world.height;
      for (const [cx, cells] of chunkData) {
        if (cells.length === expectedLength) game.world._savedChunks.set(cx, cells);
      }

      game.spawnTileX = Math.floor(game.world.width / 2);
      const start = saved && Number.isFinite(saved.x) ? saved : spawn;
      this.createSessionPlayer(start.x, start.y);
      if (saved) {
        game.player.health = saved.health ?? game.player.maxHealth;
        game.player.hunger = saved.hunger ?? game.player.maxHunger;
        game.inventory.deserialize(saved.inv);
        game.selectedIndex = Math.max(0, Math.min(8, saved.selectedIndex ?? 0));
      }
      this.attachRenderer();
      game.currentWorldSaveName = null;
      await loadInitialChunks(Math.floor(game.player.x / TILE_SIZE));
      ensurePlayerNotInSolid();
      game.player.spawnPoint = { ...spawn };
      this.beginSession();
    } catch (e) {
      game.isLoading = false;
      this.resetSessionState();
      this.showMenu('mpJoinMenu');
      throw e;
    }
  }

  markGuiScale() {
    const mark = (id, value) =>
      document.querySelectorAll(`#${id} .minecraft-button`).forEach((b) => {
        if (Number(b.dataset.value) === value) b.setAttribute('data-selected', 'true');
        else b.removeAttribute('data-selected');
      });
    mark('guiScale', prefs.getNumber('guiScale', 1));
    mark('renderScale', renderScale());
  }

  // Phones: "Tap" (tap to place, hold to break) or "Joystick" (an aim stick).
  markTouchAimMode() {
    const mode = prefs.get('touchAimMode') || 'tap';
    document.querySelectorAll('#touchAimMode .minecraft-button').forEach((b) => {
      if (b.dataset.value === mode) b.setAttribute('data-selected', 'true');
      else b.removeAttribute('data-selected');
    });
  }

  // --- App settings --------------------------------------------------------------------

  showAppOptions() {
    this.showMenu('appOptionsMenu');
    const mark = (id, on) =>
      document.querySelectorAll(`#${id} .minecraft-button`).forEach((b) => {
        if ((b.dataset.value === 'on') === on) b.setAttribute('data-selected', 'true');
        else b.removeAttribute('data-selected');
      });
    mark('appWindowControls', prefs.getBool('appWindowControls', true));
    mark('appFullscreen', prefs.getBool('appFullscreen', false));
    mark('appGpu', !prefs.getBool('disableGpu', false));
    document.querySelectorAll('#appUiMode .minecraft-button').forEach((b) => {
      if (b.dataset.value === (prefs.get('uiMode') || 'auto')) b.setAttribute('data-selected', 'true');
      else b.removeAttribute('data-selected');
    });
    const grid = document.getElementById('appIconGrid');
    if (grid.childElementCount) {
      grid.querySelectorAll('img').forEach((img) => img.classList.toggle('selected', img.dataset.id === (prefs.get('appIcon') || 'grass')));
      return;
    }
    const ids = [...registry.map.keys()].filter((id) => {
      const t = registry.get(id);
      return id !== 'air' && id !== 'water' && !registry.isItem(id) && t?.shape === 'full' && t.solid;
    });
    for (const id of ids) {
      const img = document.createElement('img');
      img.src = `assets/textures/${id}.png`;
      img.dataset.id = id;
      img.title = registry.get(id)?.displayName || id;
      img.onerror = () => img.remove();
      img.classList.toggle('selected', id === (prefs.get('appIcon') || 'grass'));
      img.addEventListener('click', () => {
        setAppIcon(img);
        grid.querySelectorAll('img').forEach((el) => el.classList.toggle('selected', el === img));
      });
      grid.appendChild(img);
    }
  }

  // --- Player settings -----------------------------------------------------------------

  showPlayerOptions() {
    this.showMenu('playerOptionsMenu');
    const nameInput = document.getElementById('playerNameInput');
    nameInput.value = prefs.get('playerUsername') || '';
    const fileInput = document.getElementById('playerSkinFile');
    if (!fileInput._bound) {
      fileInput._bound = true;
      fileInput.addEventListener('change', () => this.importSkins(fileInput));
      nameInput.addEventListener('change', () => this.savePlayerName());
      nameInput.addEventListener('input', () => this.updateNametag());
    }
    this.drawPlayerSkins();
    this.updateNametag();
    this.startSkinViewer();
  }

  savePlayerName() {
    setPlayerName(document.getElementById('playerNameInput').value);
  }

  updateNametag() {
    const tag = document.getElementById('playerNametag');
    if (!tag) return;
    tag.textContent = document.getElementById('playerNameInput').value.trim() || 'Player';
    tag.style.color = playerColor() || '';
  }

  // The big viewer: the selected skin, side-on.
  startSkinViewer() {
    const { skin, skinData } = playerSkin();
    const img = new Image();
    img.onload = () => drawSkinView(document.getElementById('playerSkinPreview'), img, 'Right');
    img.src = skinData || `assets/textures/${skin}.png`;
  }

  // The skin list: each row its face, its name and (for your own skins) Rename and Delete.
  drawPlayerSkins() {
    const list = document.getElementById('playerSkinsGrid');
    list.innerHTML = '';
    const current = prefs.get('playerSelectedSkin') || 'steve';
    const options = [{ id: 'steve', name: 'Steve', src: 'assets/textures/steve.png' }, ...savedSkins().map((sk) => ({ id: sk.id, name: sk.name, src: sk.data }))];
    const selected = options.some((o) => o.id === current) ? current : 'steve';
    const icon = (body) =>
      `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square">${body}</svg>`;
    for (const opt of options) {
      const row = document.createElement('div');
      row.className = 'skin-item skin-row' + (opt.id === selected ? ' selected' : '');
      const face = document.createElement('canvas');
      face.className = 'skin-face';
      face.width = face.height = 8;
      const img = new Image();
      img.onload = () => {
        const ctx = face.getContext('2d');
        ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8); // face
        ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8); // hat layer
      };
      img.src = opt.src;
      const label = document.createElement('div');
      label.className = 'skin-name';
      label.textContent = opt.name;
      row.append(face, label);
      // The built-in skin can't be renamed or deleted.
      if (opt.id !== 'steve') {
        const button = (title, svg, action) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'minecraft-button small skin-row-button';
          b.title = title;
          b.setAttribute('aria-label', title);
          b.innerHTML = icon(svg);
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            action(opt.id);
          });
          row.appendChild(b);
        };
        button('Rename', '<path d="M4 20h4L19 9l-4-4L4 16z"/>', (id) => this.renameSkin(id));
        button('Delete', '<path d="M6 6l12 12M18 6L6 18"/>', (id) => this.deleteSkin(id));
      }
      row.addEventListener('click', () => {
        prefs.set('playerSelectedSkin', opt.id);
        applyLocalSkin();
        this.drawPlayerSkins();
        this.startSkinViewer();
      });
      list.appendChild(row);
    }
    for (let i = options.length; i < 10; i++) {
      const empty = document.createElement('div');
      empty.className = 'skin-item skin-row skin-empty';
      empty.title = 'Add Skin';
      empty.addEventListener('click', () => document.getElementById('playerSkinFile').click());
      list.appendChild(empty);
    }
  }

  renameSkin(id) {
    const list = savedSkins();
    const sk = list.find((x) => x.id === id);
    if (!sk) return;
    const name = window.prompt('Skin name:', sk.name);
    if (name == null) return;
    sk.name = name.trim().slice(0, 20) || sk.name;
    setSavedSkins(list);
    this.drawPlayerSkins();
  }

  deleteSkin(id) {
    const list = savedSkins();
    if (!list.some((x) => x.id === id)) return;
    if (!window.confirm('Delete this skin?')) return;
    setSavedSkins(list.filter((x) => x.id !== id));
    if (prefs.get('playerSelectedSkin') === id) {
      prefs.set('playerSelectedSkin', 'steve');
      applyLocalSkin();
      this.startSkinViewer();
    }
    this.drawPlayerSkins();
  }

  importSkins(fileInput) {
    const files = [...(fileInput.files || [])];
    fileInput.value = '';
    const status = document.getElementById('playerSkinStatus');
    status.classList.remove('error');
    status.textContent = '';
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) {
            status.textContent = `${file.name}: skins must be 64x64 (or 64x32) PNGs, like Minecraft skins.`;
            status.classList.add('error');
            return;
          }
          const list = savedSkins();
          const id = `skin_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
          list.push({ id, name: file.name.replace(/\.png$/i, '').slice(0, 20) || 'Skin', data: reader.result });
          setSavedSkins(list);
          prefs.set('playerSelectedSkin', id);
          status.textContent = 'Skin added!';
          applyLocalSkin();
          this.drawPlayerSkins();
          this.startSkinViewer();
        };
        img.onerror = () => {
          status.textContent = `${file.name} isn't a PNG image.`;
          status.classList.add('error');
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }
  }

  showPauseMenu() {
    if (game.inventoryOpen || game.openContainer) closeInventory();
    game.gamePaused = true;
    syncMusic();
    game.breaker.cancel();
    const exit = document.querySelector('#pauseMenu [data-action="pause-exit"]');
    if (exit) exit.textContent = multiplayer.isGuest ? 'Leave' : 'Exit World';
    document.getElementById('pausePlayersButton')?.classList.toggle('hidden', !multiplayer.isHost);
    this.showMenu('pauseMenu');
  }

  // Hosting: each guest with what they may do (building, commands) and kick / ban buttons,
  // then the banned names with an unban button each.
  showPlayersMenu() {
    if (!multiplayer.isHost) return this.showMenu('pauseMenu');
    this.showMenu('playersMenu');
    const button = (label, action, data, selected = false) => {
      const b = document.createElement('button');
      b.className = 'minecraft-button small';
      b.textContent = label;
      b.dataset.action = action;
      Object.assign(b.dataset, data);
      if (selected) b.setAttribute('data-selected', 'true');
      return b;
    };
    const row = (name, sub, buttons) => {
      const item = document.createElement('div');
      item.className = 'mp-list-item mp-player-row';
      item.innerHTML =
        '<div class="mp-list-text"><span class="mp-list-name"></span><span class="mp-list-sub"></span></div><div class="mp-player-actions"></div>';
      item.querySelector('.mp-list-name').textContent = name;
      item.querySelector('.mp-list-sub').textContent = sub;
      item.querySelector('.mp-player-actions').append(...buttons);
      return item;
    };
    const players = document.getElementById('mpPlayerList');
    players.innerHTML = '';
    for (const g of multiplayer.guests()) {
      const id = String(g.id);
      players.appendChild(
        row(g.name, g.address || '', [
          button(`Build: ${g.perms.build ? 'ON' : 'OFF'}`, 'player-perm', { id, perm: 'build', value: g.perms.build ? 'off' : 'on' }, g.perms.build),
          button(
            `Commands: ${g.perms.commands ? 'ON' : 'OFF'}`,
            'player-perm',
            { id, perm: 'commands', value: g.perms.commands ? 'off' : 'on' },
            g.perms.commands
          ),
          button('Kick', 'player-kick', { id }),
          button('Ban', 'player-ban', { name: g.name })
        ])
      );
    }
    if (!players.childElementCount) players.innerHTML = '<div class="mp-empty">No one else has joined yet.</div>';
    const banned = document.getElementById('mpBanList');
    banned.innerHTML = '';
    for (const b of multiplayer.game.bans()) banned.appendChild(row(b.name, b.address || '', [button('Unban', 'player-unban', { name: b.name })]));
    if (!banned.childElementCount) banned.innerHTML = '<div class="mp-empty">No one is banned.</div>';
  }

  resumeGame() {
    this.showMenu(null);
    game.gamePaused = false;
    syncMusic();
  }

  populateModsMenu() {
    const modsGrid = document.getElementById('modsGrid');
    if (!modsGrid) return;
    const titleEl = document.querySelector('#modsMenu .menu-title');
    if (titleEl) titleEl.textContent = 'Mods';
    document.getElementById('modsBackButton').dataset.action = 'back-to-main';
    modsGrid.innerHTML = '';
    if (!game.modManager) return;
    for (const mod of game.modManager.getAllMods()) {
      modsGrid.appendChild(this.createModCard(mod));
    }
  }

  createModCard(mod) {
    const card = document.createElement('div');
    card.className = 'mod-card';
    if (game.modManager?.isModEnabled(mod.id)) {
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
      const enabled = game.modManager?.isModEnabled(mod.id);
      toggleButton.textContent = enabled ? 'Disable Mod' : 'Enable Mod';
      toggleButton.setAttribute('data-action', enabled ? 'disable-mod' : 'enable-mod');
    }
    this.showMenu('modDetailsMenu');
  }

  toggleMod() {
    if (!this.currentMod || !game.modManager) return;

    const action = document.getElementById('modToggleButton').getAttribute('data-action');

    if (action === 'enable-mod') {
      game.modManager.enableMod(this.currentMod.id);
      document.getElementById('modToggleButton').textContent = 'Disable Mod';
      document.getElementById('modToggleButton').setAttribute('data-action', 'disable-mod');
    } else {
      game.modManager.disableMod(this.currentMod.id);
      document.getElementById('modToggleButton').textContent = 'Enable Mod';
      document.getElementById('modToggleButton').setAttribute('data-action', 'enable-mod');
    }

    this.populateModsMenu();
  }

  startKeybindRebinding(action) {
    if (game.rebindingKey) return;
    game.rebindingKey = action;
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
    if (game.rebindingKey !== action) return;
    game.tempKeybinds[action] = keyCode;
    // Takes effect (and is saved) straight away; no Apply needed.
    keybinds[action] = keyCode;
    saveKeybinds();
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
    setTimeout(() => {
      game.rebindingKey = null;
    }, 0);
  }

  applyKeybindChanges() {
    Object.assign(keybinds, game.tempKeybinds);

    saveKeybinds();

    document.querySelectorAll('.keybind-button.modified').forEach((button) => {
      button.classList.remove('modified');
    });
  }

  getKeyDisplayName(keyCode) {
    const keyNames = {
      KeyW: 'W',
      KeyA: 'A',
      KeyS: 'S',
      KeyD: 'D',
      KeyE: 'E',
      KeyQ: 'Q',
      KeyR: 'R',
      KeyF: 'F',
      KeyZ: 'Z',
      KeyT: 'T',
      Space: 'Space',
      ShiftLeft: 'Shift',
      ShiftRight: 'Shift',
      ControlLeft: 'Ctrl',
      ControlRight: 'Ctrl',
      Escape: 'Esc',
      Minus: '-',
      Equal: '=',
      BracketLeft: '[',
      BracketRight: ']',
      NumpadSubtract: 'Num -',
      NumpadAdd: 'Num +'
    };
    return keyNames[keyCode] || keyCode.replace(/^Key/, '').replace(/^Digit/, '');
  }

  resetKeybindsToDefault() {
    game.tempKeybinds = { ...DEFAULT_KEYBINDS };
    Object.assign(keybinds, DEFAULT_KEYBINDS);
    saveKeybinds();

    Object.entries(game.tempKeybinds).forEach(([action, keyCode]) => {
      const button = document.querySelector(`[data-action="bind-${action}"]`);
      if (button) {
        button.textContent = this.getKeyDisplayName(keyCode);
        button.setAttribute('data-key', keyCode);
        button.classList.add('modified');
      }
    });
  }

  initializeBackgroundUI() {
    if (game.backgroundBlocks.length === 0) {
      game.backgroundBlocks = ['dirt'];
      game.renderer.backgroundBlocks = game.backgroundBlocks;
    }

    this.updateBackgroundUI();
    this.bindBackgroundInput();
  }

  updateBackgroundUI() {
    const container = document.getElementById('backgroundBlocks');
    if (!container) return;
    container.innerHTML = '';
    const canRemove = game.backgroundBlocks.length > 1;

    game.backgroundBlocks.forEach((blockId, index) => {
      const slot = document.createElement('div');
      slot.className = 'inventory-slot bg-block-slot';
      slot.title = registry.get(blockId)?.displayName || blockId;

      const icon = document.createElement('img');
      icon.src = `assets/textures/${blockId}.png`;
      icon.alt = '';
      icon.draggable = false;
      icon.onerror = () => {
        icon.onerror = null;
        icon.src = 'assets/textures/stone.png';
      };
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
    if (index >= 0 && index < game.backgroundBlocks.length && game.backgroundBlocks.length > 1) {
      game.backgroundBlocks.splice(index, 1);
      game.renderer.backgroundBlocks = game.backgroundBlocks;
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
      const current = items.findIndex((item) => item.classList.contains('selected'));

      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && open) {
        e.preventDefault();
        const next = e.key === 'ArrowDown' ? (current + 1) % items.length : current <= 0 ? items.length - 1 : current - 1;
        items.forEach((item) => item.classList.remove('selected'));
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
      if (id === 'air' || game.backgroundBlocks.includes(id)) continue;
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
        <img src="assets/textures/${block.id}.png" alt="" class="suggestion-icon" onerror="this.onerror=null;this.src='assets/textures/stone.png';">
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

    if (!game.backgroundBlocks.includes(trimmedId)) {
      game.backgroundBlocks.push(trimmedId);
      game.renderer.backgroundBlocks = game.backgroundBlocks;
      this.updateBackgroundUI();
    }
  }

  enableMod() {
    if (!this.currentMod || !game.modManager) return;

    game.modManager.enableMod(this.currentMod.id);
    const toggleButton = document.getElementById('modToggleButton');
    if (toggleButton) {
      toggleButton.textContent = 'Disable Mod';
      toggleButton.setAttribute('data-action', 'disable-mod');
    }

    this.populateModsMenu();
  }

  disableMod() {
    if (!this.currentMod || !game.modManager) return;
    game.modManager.disableMod(this.currentMod.id);
    const toggleButton = document.getElementById('modToggleButton');
    if (toggleButton) {
      toggleButton.textContent = 'Enable Mod';
      toggleButton.setAttribute('data-action', 'enable-mod');
    }

    this.populateModsMenu();
  }

  applyBackgroundChanges() {
    game.backgroundBlocks = game.backgroundBlocks.filter((id) => id && id.trim());
    if (game.backgroundBlocks.length === 0) game.backgroundBlocks = ['dirt'];
    saveBackgroundConfig();

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
    game.tempKeybinds = { ...keybinds };

    Object.keys(keybinds).forEach((action) => {
      const button = document.querySelector(`[data-action="bind-${action}"]`);
      if (button) {
        button.textContent = this.getKeyDisplayName(keybinds[action]);
        button.setAttribute('data-key', keybinds[action]);
        button.classList.remove('modified');
      }
    });
  }
}
