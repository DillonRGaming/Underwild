import { WorldSerializer } from './worldSerializer.js';

export class SaveManager {
  constructor() {
    this.autoSaveInterval = null;
    this.dirty = false;
    this.saving = false;
    this.lastSaveTime = 0;
    this.SAVE_INTERVAL_MS = 5000;
    this.worldName = null;
  }

  setWorldName(name) {
    this.worldName = name;
  }

  encode(world, player, items, inventory, worldMeta) {
    return JSON.stringify(WorldSerializer.encode(world, player, items, inventory, worldMeta));
  }

  async save(world, player, items, inventory, worldMeta) {
    if (!this.worldName || this.saving) return false;
    this.saving = true;
    this.dirty = false;
    try {
      const json = this.encode(world, player, items, inventory, worldMeta);
      await window.electronAPI.worlds.save(this.worldName, json);
      this.lastSaveTime = Date.now();
      return true;
    } catch (e) {
      this.dirty = true;
      console.error('Save failed:', e);
      return false;
    } finally {
      this.saving = false;
    }
  }

  saveSync(world, player, items, inventory, worldMeta) {
    if (!this.worldName) return false;
    try {
      const json = this.encode(world, player, items, inventory, worldMeta);
      const ok = window.electronAPI.worlds.saveSync(this.worldName, json);
      if (ok) this.dirty = false;
      return ok;
    } catch (e) {
      console.error('Save failed:', e);
      return false;
    }
  }

  async load(worldName) {
    if (!worldName) return null;
    try {
      const json = await window.electronAPI.worlds.load(worldName);
      if (!json) return null;
      return WorldSerializer.decode(JSON.parse(json));
    } catch (e) {
      console.error('Load failed:', e);
      return null;
    }
  }

  async listWorlds() {
    try {
      return await window.electronAPI.worlds.list();
    } catch (e) {
      console.error('List worlds failed:', e);
      return [];
    }
  }

  async deleteWorld(worldName) {
    try {
      return await window.electronAPI.worlds.delete(worldName);
    } catch (e) {
      console.error('Delete world failed:', e);
      return false;
    }
  }

  async worldExists(worldName) {
    try {
      return await window.electronAPI.worlds.exists(worldName);
    } catch (e) {
      return false;
    }
  }

  startAutoSave(getState) {
    this.stopAutoSave();
    this.autoSaveInterval = setInterval(() => {
      if (this.saving) return;
      const state = getState();
      if (state) this.save(state.world, state.player, state.items, state.inventory, state.meta);
    }, this.SAVE_INTERVAL_MS);
  }

  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  markDirty() {
    this.dirty = true;
  }
}
