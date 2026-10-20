const { app, BrowserWindow, ipcMain, nativeImage, screen, dialog, crashReporter, session } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { setupMultiplayer, shutdownMultiplayer } = require('./multiplayerServer.js');

// Installed copies keep worlds, settings and logs in the user's app-data folder
// (%APPDATA%\\Underwild on Windows) so updates never touch them. Running from the source
// folder (npm start) keeps using the project folder, as before.
// The game's files sit two folders up from this platforms/desktop/ folder.
const gameDir = path.join(__dirname, '..', '..');
const dataDir = app.isPackaged ? app.getPath('userData') : path.join(gameDir, 'data');
try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch (e) {}
const worldsDir = path.join(dataDir, 'worlds');
const prefsPath = path.join(dataDir, 'preferences.json');

let prefsCache = {};

function loadPrefs() {
  try {
    if (fs.existsSync(prefsPath)) {
      prefsCache = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load preferences:', e);
  }
}

function savePrefs() {
  try {
    fs.writeFileSync(prefsPath, JSON.stringify(prefsCache, null, 2));
  } catch (e) {
    console.error('Failed to save preferences:', e);
  }
}

function ensureWorldsDir() {
  if (!fs.existsSync(worldsDir)) {
    fs.mkdirSync(worldsDir, { recursive: true });
  }
}

let mainWindow;

// --- Startup safety --------------------------------------------------------------------
// A window that opens fully black is usually the graphics driver failing to draw. If the
// GPU process dies, or the page never says it's ready, the game turns GPU acceleration off
// (remembered in preferences) and restarts. `--safe-mode` starts with it off.
// Problems are written to underwild-log.txt next to the game, to send when reporting a bug.
const logPath = path.join(dataDir, 'underwild-log.txt');
function log(msg) {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
}

process.on('uncaughtException', (e) => log(`Crash in main process: ${e.stack || e}`));
process.on('unhandledRejection', (e) => log(`Unhandled error in main process: ${e?.stack || e}`));

// Everything that goes wrong is recorded next to the game:
//   underwild-log.txt   - this log: crashes with exit codes, errors, failed loads, system info
//   chromium-log.txt    - Chromium's own log (shows what it was doing when something died)
//   crash-dumps/        - a memory dump of every crashed process, for debugging the crash
const dumpsDir = path.join(dataDir, 'crash-dumps');
try {
  fs.mkdirSync(dumpsDir, { recursive: true });
  app.setPath('crashDumps', dumpsDir);
} catch (e) {}
crashReporter.start({ submitURL: '', uploadToServer: false, compress: false });
app.commandLine.appendSwitch('enable-logging', 'file');
app.commandLine.appendSwitch('log-file', path.join(dataDir, 'chromium-log.txt'));
app.commandLine.appendSwitch('v', '0');

loadPrefs();
const gpuOff = prefsCache.disableGpu === 'true' || process.argv.includes('--safe-mode');
if (gpuOff) app.disableHardwareAcceleration();
// Windows: the page process crashing instantly on start is usually Chromium's code-integrity
// check, or security software injecting into the sandboxed page. Skip the check always; if
// the page still crashes on start, the game restarts once without the page sandbox.
if (process.platform === 'win32') app.commandLine.appendSwitch('disable-features', 'RendererCodeIntegrity');
const noSandbox = prefsCache.noSandbox === 'true' || process.argv.includes('--safe-mode');
if (noSandbox) app.commandLine.appendSwitch('no-sandbox');

// Windows crash codes, by name.
function exitCodeName(code) {
  const hex = '0x' + (code >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const names = {
    '0xC0000005': 'ACCESS_VIOLATION (bad memory access)',
    '0xC0000409': 'STACK_BUFFER_OVERRUN',
    '0xC000001D': 'ILLEGAL_INSTRUCTION (CPU lacks an instruction)',
    '0xC0000135': 'DLL_NOT_FOUND',
    '0xC0000142': 'DLL_INIT_FAILED',
    '0xC0000022': 'ACCESS_DENIED',
    '0xC0000017': 'NO_MEMORY',
    '0xC00000FD': 'STACK_OVERFLOW',
    '0xC0000428': 'INVALID_IMAGE_HASH (code integrity / blocked DLL)',
    '0xE0000008': 'OUT_OF_MEMORY'
  };
  return `${hex} ${names[hex] || ''}`.trim();
}

function listCrashDumps() {
  try {
    const files = [];
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (f.name.endsWith('.dmp')) files.push(path.relative(dataDir, p));
      }
    };
    walk(dumpsDir);
    log(`Crash dumps: ${files.length ? files.join(', ') : 'none written'}`);
  } catch (e) {
    log(`Could not list crash dumps: ${e.message}`);
  }
}

function restartWithoutGpu(reason) {
  if (gpuOff) return;
  log(`Turning GPU acceleration off and restarting: ${reason}`);
  prefsCache.disableGpu = 'true';
  savePrefs();
  app.relaunch();
  app.exit(0);
}

app.on('child-process-gone', (event, details) => {
  log(
    `Process gone: ${details.type}${details.name ? ` "${details.name}"` : ''} (${details.reason}, exit code ${details.exitCode} = ${exitCodeName(details.exitCode)})`
  );
  if (details.type === 'GPU' && details.reason !== 'clean-exit') restartWithoutGpu('the GPU process crashed');
});

let pageReady = false;

// If the game page still crashes on start, test step by step what makes it crash (a blank
// page, the font, the styles, a canvas, audio) and write the results to the log.
const DIAG_TESTS = ['blank', 'font', 'css', 'canvas', 'audio'];
let diag = null; // { i } while testing
let diagnosed = false;

function startDiagnostics() {
  diag = { i: 0 };
  log('Running startup tests to find what crashes...');
  runDiagTest();
}

function runDiagTest() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (diag.i >= DIAG_TESTS.length) {
    log("DIAGNOSIS: every basic test passed, so something in the game's own code crashes the page on this PC.");
    return finishDiagnostics();
  }
  log(`Test ${diag.i + 1}/${DIAG_TESTS.length}: ${DIAG_TESTS[diag.i]}`);
  mainWindow.loadFile(path.join(__dirname, 'diag.html'), { query: { t: DIAG_TESTS[diag.i] } });
}

ipcMain.on('app:diagOk', (event, test) => {
  if (!diag || test !== DIAG_TESTS[diag.i]) return;
  log(`  ${test}: OK`);
  diag.i++;
  runDiagTest();
});

function onDiagCrash() {
  const test = DIAG_TESTS[diag.i];
  log(`  ${test}: CRASHED`);
  log(
    test === 'blank'
      ? 'DIAGNOSIS: even a blank page crashes, so it is something on this PC (security/antivirus, audio or overlay software injecting into apps), not the game.'
      : `DIAGNOSIS: the "${test}" test crashes the page.`
  );
  finishDiagnostics();
}

function finishDiagnostics() {
  diag = null;
  diagnosed = true;
  dialog
    .showMessageBox(mainWindow, {
      type: 'error',
      title: 'Underwild could not start',
      message:
        "Underwild crashed while starting. A report was saved to underwild-log.txt in the game's resources\\app folder - please send it to the person who gave you the game."
    })
    .then(() => app.quit());
}
ipcMain.on('app:ready', (event, info) => {
  pageReady = true;
  log(`Page ready: ${JSON.stringify(info || {})}`);
  // A few seconds in, record what the game drew and the window/display setup, to tell
  // "the game draws black" apart from "the game draws fine but nothing shows".
  setTimeout(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      log(
        `Window bounds ${JSON.stringify(mainWindow.getBounds())}, visible ${mainWindow.isVisible()}, minimized ${mainWindow.isMinimized()}, fullscreen ${mainWindow.isFullScreen()}`
      );
      log(`Displays ${JSON.stringify(screen.getAllDisplays().map((d) => ({ bounds: d.bounds, scale: d.scaleFactor })))}`);
      log(`GPU ${JSON.stringify(app.getGPUFeatureStatus())}`);
      const state = await mainWindow.webContents.executeJavaScript(`({
        menus: [...document.querySelectorAll('.menu-container:not(.hidden)')].map(m => m.id),
        size: [innerWidth, innerHeight],
        bodyBg: getComputedStyle(document.body).backgroundColor,
        canvas: document.getElementById('gameCanvas')?.style.display || null,
        theme: document.documentElement.dataset.theme || null
      })`);
      log(`Page state ${JSON.stringify(state)}`);
      const shot = await mainWindow.webContents.capturePage();
      fs.writeFileSync(path.join(dataDir, 'underwild-screen.png'), shot.toPNG());
      log('Saved underwild-screen.png');
    } catch (e) {
      log(`Diagnostics failed: ${e.message}`);
    }
  }, 4000);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    title: 'Underwild',
    // The icon picked in Options > App (a block texture), or grass.
    icon: appIcon(prefsCache.appIconData) || path.join(gameDir, 'assets', 'textures', 'grass.png'),
    fullscreen: prefsCache.appFullscreen === 'true',
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(gameDir, 'index.html'));
  // For testing the startup tests on a PC where the game works.
  if (process.env.UNDERWILD_DIAG) setTimeout(startDiagnostics, 2000);

  const wc = mainWindow.webContents;
  const LEVELS = ['log', 'info', 'warning', 'error'];
  wc.on('console-message', (event, level, message, line, source) => {
    // Newer Electron puts the details on the event (level as a word); older passes them.
    if (message === undefined) ({ level, message, lineNumber: line, sourceId: source } = event);
    log(`Page ${LEVELS[level] || level}: ${message}${source ? ` (${source}:${line})` : ''}`);
  });
  wc.on('preload-error', (event, preloadPath, error) => log(`Preload failed (${preloadPath}): ${error?.stack || error}`));
  wc.on('unresponsive', () => log('The page stopped responding.'));
  wc.on('responsive', () => log('The page is responding again.'));
  wc.on('did-finish-load', () => log(`Loaded ${wc.getURL()}`));
  wc.on('did-fail-provisional-load', (event, code, desc, url) => log(`Failed to start loading ${url}: ${desc} (${code})`));
  // Every file the page asks for that fails (missing texture, script, sound...).
  session.defaultSession.webRequest.onErrorOccurred((d) => log(`Could not load ${d.url}: ${d.error}`));
  session.defaultSession.webRequest.onCompleted((d) => {
    if (d.statusCode >= 400) log(`Could not load ${d.url}: HTTP ${d.statusCode}`);
  });
  wc.on('render-process-gone', (event, details) => {
    log(`Page crashed: ${details.reason} (exit code ${details.exitCode} = ${exitCodeName(details.exitCode)})${noSandbox ? ', sandbox off' : ''}`);
    setTimeout(listCrashDumps, 1500);
    if (details.reason === 'clean-exit') return;
    if (diag) return onDiagCrash();
    if (pageReady) return;
    if (!noSandbox) {
      log('The page crashed while starting: restarting without the page sandbox.');
      prefsCache.noSandbox = 'true';
      savePrefs();
      app.relaunch();
      app.exit(0);
    } else {
      startDiagnostics();
    }
  });
  wc.on('did-fail-load', (event, code, desc, url) => log(`Failed to load ${url}: ${desc}`));
  // Ctrl+Shift+I opens the developer tools, to see errors.
  wc.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') wc.toggleDevTools();
  });
  setTimeout(() => {
    if (!pageReady && !diag && !diagnosed) {
      log('The page did not finish starting within 15 seconds.');
      restartWithoutGpu('the page never became ready');
    }
  }, 15000);
}

app.whenReady().then(() => {
  log(
    `Starting Underwild (Electron ${process.versions.electron}, ${process.platform}${gpuOff ? ', GPU acceleration off' : ''}${noSandbox ? ', sandbox off' : ''})`
  );
  log(
    `System: ${os.type()} ${os.release()} ${os.arch()}, ${os.cpus()[0]?.model || '?'} x${os.cpus().length}, ${Math.round(os.totalmem() / 1e9)} GB RAM; Chrome ${process.versions.chrome}, Node ${process.versions.node}`
  );
  log(`Game folder: ${gameDir}`);
  log(`Data folder: ${dataDir}`);
  log(`Command line: ${process.argv.join(' ')}`);
  app
    .getGPUInfo('complete')
    .then((info) => {
      const gpus = (info.gpuDevice || []).map(
        (g) => `${g.vendorString || g.vendorId} ${g.deviceString || g.deviceId} (driver ${g.driverVersion || '?'})${g.active ? ' [active]' : ''}`
      );
      log(`GPUs: ${gpus.join('; ') || 'unknown'}`);
    })
    .catch((e) => log(`GPU info unavailable: ${e.message}`));
  ensureWorldsDir();
  setupMultiplayer(ipcMain, () => mainWindow);
  createWindow();
});

app.on('window-all-closed', () => {
  shutdownMultiplayer();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});

// The app icon: pixel-sharp PNGs of one block at several sizes (16px up to 256px), as one
// image with a representation per size so the system can use an exact one.
function appIcon(data) {
  try {
    if (typeof data === 'string') data = data.startsWith('[') ? JSON.parse(data) : [data];
    if (!Array.isArray(data) || !data.length) return null;
    const pngs = data.filter((d) => typeof d === 'string' && d.startsWith('data:image/png'));
    if (!pngs.length) return null;
    const base = nativeImage.createFromDataURL(pngs[0]);
    const baseSize = base.getSize().width || 16;
    for (const d of pngs.slice(1)) {
      const img = nativeImage.createFromDataURL(d);
      base.addRepresentation({ scaleFactor: img.getSize().width / baseSize, dataURL: d });
    }
    return base.isEmpty() ? null : base;
  } catch (e) {
    return null;
  }
}

ipcMain.on('app:setIcon', (event, data) => {
  const img = appIcon(data);
  if (mainWindow && img) mainWindow.setIcon(img);
});

ipcMain.on('app:setFullscreen', (event, on) => {
  if (mainWindow) mainWindow.setFullScreen(!!on);
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

function loadWorldMeta(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (data && data.meta) return data.meta;
    return {};
  } catch (e) {
    return {};
  }
}

ipcMain.handle('worlds:list', async () => {
  ensureWorldsDir();
  const files = fs.readdirSync(worldsDir).filter((f) => f.endsWith('.json'));
  const worlds = [];
  for (const file of files) {
    const name = path.basename(file, '.json');
    const filePath = path.join(worldsDir, file);
    try {
      const stat = fs.statSync(filePath);
      const meta = loadWorldMeta(filePath);
      worlds.push({
        name: meta.displayName || name,
        fileName: file,
        seed: meta.seed || 0,
        gameMode: meta.gameMode || 'survival',
        createdAt: stat.birthtimeMs || stat.ctimeMs,
        modifiedAt: stat.mtimeMs,
        sizeBytes: stat.size
      });
    } catch (e) {
      worlds.push({ name, fileName: file, error: e.message });
    }
  }
  worlds.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
  return worlds;
});

function worldFilePath(worldName) {
  const safeName =
    String(worldName || '')
      .replace(/[^a-zA-Z0-9_\- ]/g, '_')
      .trim() || 'World';
  return path.join(worldsDir, safeName + '.json');
}

function writeWorldFile(worldName, json) {
  ensureWorldsDir();
  const filePath = worldFilePath(worldName);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, json, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

ipcMain.handle('worlds:exists', async (event, worldName) => {
  ensureWorldsDir();
  return fs.existsSync(worldFilePath(worldName));
});

ipcMain.handle('worlds:save', async (event, worldName, json) => {
  writeWorldFile(worldName, json);
  return true;
});

ipcMain.on('worlds:saveSync', (event, worldName, json) => {
  try {
    writeWorldFile(worldName, json);
    event.returnValue = true;
  } catch (e) {
    console.error('Failed to save world:', e);
    event.returnValue = false;
  }
});

ipcMain.handle('worlds:load', async (event, worldName) => {
  ensureWorldsDir();
  const filePath = worldFilePath(worldName);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
});

ipcMain.handle('worlds:delete', async (event, worldName) => {
  ensureWorldsDir();
  const filePath = worldFilePath(worldName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return true;
});

ipcMain.handle('prefs:getAll', async () => {
  return { ...prefsCache };
});

ipcMain.handle('prefs:get', async (event, key) => {
  return Object.prototype.hasOwnProperty.call(prefsCache, key) ? prefsCache[key] : null;
});

ipcMain.handle('prefs:set', async (event, key, value) => {
  prefsCache[key] = value;
  savePrefs();
  return true;
});

ipcMain.handle('prefs:setMany', async (event, entries) => {
  for (const [key, value] of Object.entries(entries)) {
    prefsCache[key] = value;
  }
  savePrefs();
  return true;
});

ipcMain.handle('prefs:delete', async (event, key) => {
  delete prefsCache[key];
  savePrefs();
  return true;
});

ipcMain.handle('prefs:clear', async () => {
  prefsCache = {};
  savePrefs();
  return true;
});

// --- Updates -----------------------------------------------------------------------------
// Installed copies check GitHub Releases on start. A newer version downloads in the
// background, then the player is asked to restart into it (or it installs on quit).
function checkForUpdates() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    log(`Updater unavailable: ${e.message}`);
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (e) => log(`Update check failed: ${e?.message || e}`));
  autoUpdater.on('update-downloaded', async (info) => {
    log(`Update ${info.version} downloaded`);
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Underwild ${info.version} is ready.`,
      detail: 'Restart to play the new version (your worlds are kept). Choosing Later installs it next time you close the game.'
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.checkForUpdates().catch((e) => log(`Update check failed: ${e?.message || e}`));
}
app.whenReady().then(() => setTimeout(checkForUpdates, 3000));
