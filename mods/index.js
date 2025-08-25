class ModManager {
  constructor() {
    this.mods = new Map();
    this.enabledMods = new Set();
    this.registry = null;
    this.world = null;
    this.loadMods();
  }

  initialize(registry, world) {
    this.registry = registry;
    this.world = world;
  }

  loadMods() {
    try {
      
    } catch (error) {
      
    }
  }

  registerMod(mod) {
    this.mods.set(mod.id, mod);
  }

  enableMod(modId) {
    const mod = this.mods.get(modId);
    if (mod && !this.enabledMods.has(modId)) {
      mod.enable(this.registry, this.world);
      this.enabledMods.add(modId);
    }
  }

  disableMod(modId) {
    const mod = this.mods.get(modId);
    if (mod && this.enabledMods.has(modId)) {
      mod.disable(this.registry, this.world);
      this.enabledMods.delete(modId);
    }
  }

  getMod(modId) {
    return this.mods.get(modId);
  }

  getAllMods() {
    return Array.from(this.mods.values());
  }

  getEnabledMods() {
    return Array.from(this.enabledMods).map(id => this.mods.get(id));
  }

  isModEnabled(modId) {
    return this.enabledMods.has(modId);
  }
}

export { ModManager };
