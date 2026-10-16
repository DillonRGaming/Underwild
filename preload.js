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
  app: {
    ready: (info) => ipcRenderer.send('app:ready', info),
    diagOk: (test) => ipcRenderer.send('app:diagOk', test),
    setIcon: (dataUrl) => ipcRenderer.send('app:setIcon', dataUrl),
    setFullscreen: (on) => ipcRenderer.send('app:setFullscreen', on)
  },
  mp: {
    host: (port) => ipcRenderer.invoke('mp:host', port),
    stopHost: () => ipcRenderer.send('mp:stopHost'),
    announce: (info) => ipcRenderer.send('mp:announce', info),
    hostSend: (target, data) => ipcRenderer.send('mp:hostSend', target, data),
    kick: (id) => ipcRenderer.send('mp:kick', id),
    browse: (on) => ipcRenderer.send('mp:browse', on),
    join: (address, port) => ipcRenderer.invoke('mp:join', address, port),
    leave: () => ipcRenderer.send('mp:leave'),
    clientSend: (data) => ipcRenderer.send('mp:clientSend', data),
    addresses: () => ipcRenderer.invoke('mp:addresses'),
    onEvent: (cb) => {
      const listener = (e, payload) => cb(payload);
      ipcRenderer.on('mp:event', listener);
      return () => ipcRenderer.removeListener('mp:event', listener);
    }
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
