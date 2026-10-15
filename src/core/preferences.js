export class Preferences {
  constructor() {
    this.cache = {};
    this.ready = false;
    this._initPromise = null;
  }

  init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      try {
        if (window.electronAPI && window.electronAPI.prefs) {
          this.cache = await window.electronAPI.prefs.getAll();
        }
      } catch (e) {
        console.error('Failed to load preferences:', e);
      }
      this.ready = true;
    })();
    return this._initPromise;
  }

  get(key, defaultValue = null) {
    const val = this.cache[key];
    if (val === undefined || val === null) return defaultValue;
    return val;
  }

  getNumber(key, defaultValue = 0) {
    const val = this.get(key);
    if (val === null || val === undefined) return defaultValue;
    const n = Number(val);
    return isNaN(n) ? defaultValue : n;
  }

  getBool(key, defaultValue = false) {
    const val = this.get(key);
    if (val === null || val === undefined) return defaultValue;
    return val === 'true' || val === true;
  }

  getJSON(key, defaultValue = null) {
    const val = this.get(key);
    if (val === null || val === undefined) return defaultValue;
    try {
      return JSON.parse(val);
    } catch (e) {
      return defaultValue;
    }
  }

  async set(key, value) {
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    this.cache[key] = strValue;
    try {
      if (window.electronAPI && window.electronAPI.prefs) {
        await window.electronAPI.prefs.set(key, strValue);
      }
    } catch (e) {
      console.error('Failed to save preference:', key, e);
    }
  }

  async setMany(entries) {
    const strEntries = {};
    for (const [key, value] of Object.entries(entries)) {
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      this.cache[key] = strValue;
      strEntries[key] = strValue;
    }
    try {
      if (window.electronAPI && window.electronAPI.prefs) {
        await window.electronAPI.prefs.setMany(strEntries);
      }
    } catch (e) {
      console.error('Failed to save preferences:', e);
    }
  }

  async delete(key) {
    delete this.cache[key];
    try {
      if (window.electronAPI && window.electronAPI.prefs) {
        await window.electronAPI.prefs.delete(key);
      }
    } catch (e) {
      console.error('Failed to delete preference:', key, e);
    }
  }

  async clear() {
    this.cache = {};
    try {
      if (window.electronAPI && window.electronAPI.prefs) {
        await window.electronAPI.prefs.clear();
      }
    } catch (e) {
      console.error('Failed to clear preferences:', e);
    }
  }
}
