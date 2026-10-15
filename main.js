const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const worldsDir = path.join(__dirname, 'worlds');
const prefsPath = path.join(__dirname, 'preferences.json');

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    title: 'Underwild',
    icon: path.join(__dirname, 'textures', 'grass.png'),
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
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  loadPrefs();
  ensureWorldsDir();
  createWindow();
});

app.on('window-all-closed', () => {
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
  const files = fs.readdirSync(worldsDir).filter(f => f.endsWith('.json'));
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
  const safeName = String(worldName || '').replace(/[^a-zA-Z0-9_\- ]/g, '_').trim() || 'World';
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
