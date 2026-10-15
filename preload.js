const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
  },
  worlds: {
    list: () => ipcRenderer.invoke('worlds:list'),
    exists: (name) => ipcRenderer.invoke('worlds:exists', name),
    save: (name, data) => ipcRenderer.invoke('worlds:save', name, data),
    saveSync: (name, data) => ipcRenderer.sendSync('worlds:saveSync', name, data),
    load: (name) => ipcRenderer.invoke('worlds:load', name),
    delete: (name) => ipcRenderer.invoke('worlds:delete', name)
  },
  prefs: {
    getAll: () => ipcRenderer.invoke('prefs:getAll'),
    get: (key) => ipcRenderer.invoke('prefs:get', key),
    set: (key, value) => ipcRenderer.invoke('prefs:set', key, value),
    setMany: (entries) => ipcRenderer.invoke('prefs:setMany', entries),
    delete: (key) => ipcRenderer.invoke('prefs:delete', key),
    clear: () => ipcRenderer.invoke('prefs:clear')
  }
});
