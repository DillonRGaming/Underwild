import { sampleBlockAt } from '../logic/terrainGen.js';
import { TILE_SIZE } from './utils.js';

export class World {
  constructor(width, height, registry) {
    this.width = width;
    this.height = height;
    this.registry = registry;

    this.chunkSize = 8;
    this.chunks = new Map();
    this.loadedChunkOrder = [];
    this.maxLoadedChunks = 9;

    this.time = 0;
    this.dayLength = 1440;
    
    this.lightMap = new Array(width * height);
    for (let i = 0; i < this.lightMap.length; i++) {
      this.lightMap[i] = 15;
    }
    
    this.stars = [];
    this.initializeStars();

    this.seed = 0;

    this._savedEntities = new Map();

    this._dirtyChunks = new Set();

    this._crossChunkPending = new Map();
    this._savedChunks = new Map();
    this._sampleCache = new Map();
    this._savedChestInventories = new Map();

    try {
      this._chunkWorker = new Worker('src/logic/chunkWorker.js', { type: 'module' });
      this._pendingChunkLoads = new Map();
      this._chunkWorker.onmessage = (e) => {
        const msg = e.data;
        if (!msg) return;
        if (msg.cmd === 'chunkGenerated') {
          const { chunkX, cells } = msg;
          const key = this.chunkKey(chunkX);
          const chunk = { chunkX, cells, dirty: false };

          try {
            const saved = this._savedChunks.get(chunkX);
            if (saved && Array.isArray(saved) && saved.length === cells.length) {
              chunk.cells = saved.slice();
              chunk.dirty = true;
              this._savedChunks.delete(chunkX);
            }
          } catch (e) {}

          this.chunks.set(key, chunk);
          for (let rx = 0; rx < this.chunkSize; rx++) {
            const wx = chunkX * this.chunkSize + rx;
            try { this._sampleCache.delete(wx); } catch (e) {}
          }

          try {
            const pending = this._crossChunkPending.get(chunkX);
            if (pending && pending.length) {
              for (const p of pending) {
                const rx = p.x - (chunkX * this.chunkSize);
                if (rx >= 0 && rx < this.chunkSize && p.y >= 0 && p.y < this.height) {
                  const idx = p.y * this.chunkSize + rx;
                  const existing = chunk.cells[idx];
                  if (!existing || existing.id === 'air') {
                    chunk.cells[idx] = { id: p.id, meta: p.meta ?? null };
                    chunk.dirty = true;
                  }
                }
              }
              this._crossChunkPending.delete(chunkX);
            }
          } catch (err) {}

          this._touchChunkLRU(chunkX);
          this._enforceChunkLimit();
          
          this.calculateSkyLight();
          this.propagateLight();
          
          const pending = this._pendingChunkLoads.get(chunkX);
          if (pending) {
            pending.resolve(chunk);
            this._pendingChunkLoads.delete(chunkX);
          }
        }
      };
    } catch (err) {
      this._chunkWorker = null;
      this._pendingChunkLoads = new Map();
    }
  }
  
  initializeStars() {
    for (let i = 0; i < 200; i++) {
      this.stars.push({
        x: Math.random() * 2000,
        y: Math.random() * 1000,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.3 + 0.1,
        speed: Math.random() * 0.3 + 0.05,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  index(x, y) {
    return y * this.width + x;
  }
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  chunkXFor(x) {
    return Math.floor(x / this.chunkSize);
  }
  xRelInChunk(x) {
    const cx = this.chunkXFor(x);
    return x - cx * this.chunkSize;
  }
  chunkKey(cx) {
    return String(cx);
  }

  isChunkLoaded(chunkX) {
    return this.chunks.has(this.chunkKey(chunkX));
  }

  

  async loadChunkAsync(chunkX) {
    const key = this.chunkKey(chunkX);
    if (this.chunks.has(key) && this.chunks.get(key).cells) {
      this._touchChunkLRU(chunkX);
      return this.chunks.get(key);
    }

    if (this._pendingChunkLoads && this._pendingChunkLoads.has(chunkX)) {
      return this._pendingChunkLoads.get(chunkX).promise;
    }

    let resolveLoad, rejectLoad;
    const loadingPromise = new Promise((res, rej) => { resolveLoad = res; rejectLoad = rej; });
    const placeholder = { chunkX, cells: null, dirty: false, loadingPromise };
    this.chunks.set(key, placeholder);

    if (this._chunkWorker) {
      this._pendingChunkLoads.set(chunkX, { resolve: resolveLoad, reject: rejectLoad, promise: loadingPromise });

      try {
        this._chunkWorker.postMessage({
          cmd: 'generateChunk',
          chunkX,
          chunkSize: this.chunkSize,
          height: this.height,
          seed: this.seed ?? 0,
          worldWidth: this.width,
          worldType: this.worldType || 'regular',
          superflatLayers: this.superflatLayers
        });
      } catch (err) {
        this._pendingChunkLoads.delete(chunkX);
      }

      try {
        const chunk = await loadingPromise;
        this._touchChunkLRU(chunkX);
        return chunk;
      } catch (err) {
      }
    }

    setTimeout(() => {
      try {
        const cells = new Array(this.chunkSize * this.height);
        const baseX = chunkX * this.chunkSize;
        for (let rx = 0; rx < this.chunkSize; rx++) {
          const worldX = baseX + rx;
          for (let y = 0; y < this.height; y++) {
            if (worldX < 0 || worldX >= this.width) {
              cells[y * this.chunkSize + rx] = { id: 'air', meta: null };
                    } else {
              const sampled = sampleBlockAt(worldX, y, this.seed ?? 0, this.height, this.width, this.worldType, this.superflatLayers);
              cells[y * this.chunkSize + rx] = { id: sampled.id, meta: sampled.meta ?? null };
            }
          }
        }

        try {
          if (typeof this.generateVegetation === 'function') {
            this.generateVegetation(cells, baseX);
          }
        } catch (vegErr) {
        }

    const chunk = { chunkX, cells, dirty: false };

    try {
      const saved = this._savedChunks.get(chunkX);
      if (saved && Array.isArray(saved) && saved.length === cells.length) {
        chunk.cells = saved.slice();
        chunk.dirty = true;
        this._savedChunks.delete(chunkX);
      }
    } catch (e) {}

    const savedChests = this._savedChestInventories.get(chunkX);
    if (savedChests && savedChests.length > 0) {
      for (const savedChest of savedChests) {
        const rx = savedChest.x - (chunkX * this.chunkSize);
        const idx = savedChest.y * this.chunkSize + rx;
        if (chunk.cells[idx] && chunk.cells[idx].id === 'chest') {
          if (!chunk.cells[idx].meta) chunk.cells[idx].meta = {};
          chunk.cells[idx].meta.inv = savedChest.inv;
        }
      }
      this._savedChestInventories.delete(chunkX);
    }

    this.chunks.set(key, chunk);
    this._touchChunkLRU(chunkX);
    this._enforceChunkLimit();

        try {
          const chunkX = Math.floor(baseX / this.chunkSize);
          this.initializeChunkLighting(chunkX);
        } catch (e) {
        }

        resolveLoad(chunk);
        if (this.chunks.has(key)) delete this.chunks.get(key).loadingPromise;
      } catch (err) {
        this.chunks.delete(key);
        resolveLoad();
      }
    }, 0);

    this._pendingChunkLoads.set(chunkX, { resolve: resolveLoad, reject: rejectLoad, promise: loadingPromise });

    try {
      const loaded = await loadingPromise;
      this._touchChunkLRU(chunkX);
      if (this._pendingChunkLoads.has(chunkX)) this._pendingChunkLoads.delete(chunkX);
      return loaded;
    } catch (err) {
      if (this._pendingChunkLoads.has(chunkX)) this._pendingChunkLoads.delete(chunkX);
      throw err;
    }
  }

  _touchChunkLRU(chunkX) {
    const idx = this.loadedChunkOrder.indexOf(chunkX);
    if (idx !== -1) this.loadedChunkOrder.splice(idx, 1);
    this.loadedChunkOrder.push(chunkX);
  }

  _enforceChunkLimit() {
    while (this.loadedChunkOrder.length > this.maxLoadedChunks) {
      const oldestChunkX = this.loadedChunkOrder.shift();
      if (oldestChunkX !== undefined) {
        this.unloadChunk(oldestChunkX);
      }
    }
  }

  loadChunk(chunkX) {
    const key = this.chunkKey(chunkX);
    if (this.chunks.has(key)) {
      const chunk = this.chunks.get(key);
      this._touchChunkLRU(chunkX);
      return chunk;
    }
    
    return null;
  }

  

  unloadChunk(chunkX) {
    const key = this.chunkKey(chunkX);

    try {
      if (this.items && Array.isArray(this.items)) {
        const baseX = chunkX * this.chunkSize;
        const minX = baseX;
        const maxX = baseX + this.chunkSize;
        const toSave = [];
        for (let i = this.items.length - 1; i >= 0; i--) {
          const it = this.items[i];
          if (!it) continue;
          const cx = Math.floor((it.x + (it.width || 0) / 2) / TILE_SIZE);
          if (cx >= minX && cx < maxX) {
            toSave.push({
              blockId: it.blockId,
              x: it.x,
              y: it.y,
              vx: it.vx,
              vy: it.vy,
              life: it.life,
              age: it.age ?? 0
            });
            this.items.splice(i, 1);
          }
        }
        if (toSave.length > 0) {
          this._savedEntities.set(chunkX, (this._savedEntities.get(chunkX) || []).concat(toSave));
        }
      }
    } catch (err) {
    }

    if (this.chunks.has(key)) {
      try {
        const ch = this.chunks.get(key);
        if (ch && ch.cells && ch.dirty) {
          const chestsInChunk = [];
          for (let y = 0; y < this.height; y++) {
            for (let rx = 0; rx < this.chunkSize; rx++) {
              const cell = ch.cells[y * this.chunkSize + rx];
              if (cell && cell.id === 'chest' && cell.meta && cell.meta.inv) {
                chestsInChunk.push({
                  x: chunkX * this.chunkSize + rx,
                  y: y,
                  inv: cell.meta.inv
                });
              }
            }
          }
          if (chestsInChunk.length > 0) {
            this._savedChestInventories.set(chunkX, chestsInChunk);
          }

          try {
            this._savedChunks.set(chunkX, ch.cells.slice());
          } catch (e) {}
        }
      } catch (e) {}
      this.chunks.delete(key);
    }
    const idx = this.loadedChunkOrder.indexOf(chunkX);
    if (idx !== -1) this.loadedChunkOrder.splice(idx, 1);
  }

  fetchSavedEntitiesForChunk(chunkX) {
    const arr = this._savedEntities.get(chunkX) || [];
    this._savedEntities.delete(chunkX);
    return arr;
  }

  

  getCell(x, y) {
    if (!this.inBounds(x, y)) return { id: 'air', meta: null };
    const cx = this.chunkXFor(x);
    const key = this.chunkKey(cx);
    if (this.chunks.has(key)) {
      const chunk = this.chunks.get(key);
      this._touchChunkLRU(cx);
      if (!chunk || !chunk.cells) {
        return { id: 'air', meta: null };
      }
      const rx = this.xRelInChunk(x);
      const idx = y * this.chunkSize + rx;
      return chunk.cells[idx] ?? { id: 'air', meta: null };
    }
    return { id: 'air', meta: null };
  }

  getBlockId(x, y) {
    return this.getCell(x, y).id;
  }

  getBlockType(x, y) {
    const id = this.getBlockId(x, y);
    return this.registry.get(id);
  }

  setBlock(x, y, id, meta = null) {
    if (!this.inBounds(x, y)) return;
    const cx = this.chunkXFor(x);
    const chunk = this.loadChunk(cx);
    
    if (chunk && chunk.cells) {
      const rx = this.xRelInChunk(x);
      const idx = y * this.chunkSize + rx;
      chunk.cells[idx] = { id, meta };
      chunk.dirty = true;
      try {
        this._dirtyChunks.add(cx);
      } catch (e) {
      }
      
      this.updateLighting(x, y);
    } else {
      if (!this._crossChunkPending.has(cx)) {
        this._crossChunkPending.set(cx, []);
      }
      this._crossChunkPending.get(cx).push({ x, y, id, meta });
    }
  }

  getLight(x, y) {
    if (!this.inBounds(x, y)) return 0;
    return this.lightMap[this.index(x, y)];
  }
  
  setLight(x, y, light) {
    if (!this.inBounds(x, y)) return;
    this.lightMap[this.index(x, y)] = Math.max(0, Math.min(15, light));
  }
  
  calculateSkyLight() {
    for (const chunkEntry of this.chunks.values()) {
      if (!chunkEntry || !chunkEntry.cells) continue;
      
      const chunkX = chunkEntry.chunkX;
      const startX = chunkX * this.chunkSize;
      const endX = startX + this.chunkSize;
      
      for (let x = startX; x < endX; x++) {
        let skyLight = 15;
        
        for (let y = 0; y < this.height; y++) {
          const blockType = this.getBlockType(x, y);
          const existingLight = this.getLight(x, y);
          const isBlockLightSource = blockType && blockType.lightLevel && blockType.lightLevel > 0;
          
          if (isBlockLightSource) {
            const lightSourceLevel = blockType.lightLevel;
            this.setLight(x, y, lightSourceLevel);
          } else {
            const newLight = Math.max(skyLight, existingLight);
            this.setLight(x, y, newLight);
          }
          
          if (blockType && blockType.solid) {
            const opacity = blockType.opacity !== undefined ? blockType.opacity : 1;
            if (opacity >= 1) {
              skyLight = Math.max(0, skyLight - 15);
            } else {
              skyLight = Math.max(0, skyLight - Math.floor(15 * opacity));
            }
          }
          if (skyLight <= 0) {
            for (let y2 = y + 1; y2 < this.height; y2++) {
              this.setLight(x, y2, 0);
            }
            break;
          }
        }
      }
    }
  }
  
  calculateBlockLight() {
    const lightSources = [];
    
    for (const chunkEntry of this.chunks.values()) {
      if (!chunkEntry || !chunkEntry.cells) continue;
      
      const chunkX = chunkEntry.chunkX;
      const startX = chunkX * this.chunkSize;
      const endX = startX + this.chunkSize;
      
      for (let y = 0; y < this.height; y++) {
        for (let x = startX; x < endX; x++) {
          const blockType = this.getBlockType(x, y);
          if (blockType && blockType.lightLevel && blockType.lightLevel > 0) {
            lightSources.push({ x, y, light: blockType.lightLevel });
          }
        }
      }
    }
    
    for (const source of lightSources) {
      this.propagateLightFromSource(source.x, source.y, source.light);
    }
  }
  
  propagateLightFromSource(x, y, lightLevel) {
    const queue = [{ x, y, light: lightLevel }];
    const visited = new Set();
    
    while (queue.length > 0) {
      const { x, y, light } = queue.shift();
      const idx = this.index(x, y);
      
      if (visited.has(idx)) continue;
      visited.add(idx);
      
      const currentLight = this.getLight(x, y);
      const combinedLight = Math.max(currentLight, light);
      this.setLight(x, y, combinedLight);
      
      const neighbors = [
        { x: x + 1, y: y },
        { x: x - 1, y: y },
        { x: x, y: y + 1 },
        { x: x, y: y - 1 }
      ];
      
      for (const n of neighbors) {
        if (this.inBounds(n.x, n.y)) {
          const blockType = this.getBlockType(n.x, n.y);
          let newLight;
          
          if (!blockType || blockType.id === 'air') {
            newLight = Math.max(0, light - 1);
          } else if (blockType.solid) {
            const opacity = blockType.opacity !== undefined ? blockType.opacity : 1;
            newLight = Math.max(0, light - 1 - Math.floor(15 * opacity));
          } else {
            newLight = Math.max(0, light - 1);
          }
          
          if (newLight > 0 && newLight > this.getLight(n.x, n.y)) {
            queue.push({ x: n.x, y: n.y, light: newLight });
          }
        }
      }
    }
  }
  
  propagateLight() {
    const queue = [];
    const visited = new Set();
    
    for (const chunkEntry of this.chunks.values()) {
      if (!chunkEntry || !chunkEntry.cells) continue;
      
      const chunkX = chunkEntry.chunkX;
      const startX = chunkX * this.chunkSize;
      const endX = startX + this.chunkSize;
      
      for (let y = 0; y < this.height; y++) {
        for (let x = startX; x < endX; x++) {
          const light = this.getLight(x, y);
          if (light > 0) {
            queue.push({x, y, light});
          }
        }
      }
    }
    
    while (queue.length > 0) {
      const {x, y, light} = queue.shift();
      const idx = this.index(x, y);
      if (visited.has(idx) && this.getLight(x, y) >= light) continue;
      visited.add(idx);
      if (light > this.getLight(x, y)) {
        this.setLight(x, y, light);
      }
      const neighbors = [
        {x: x + 1, y},
        {x: x - 1, y},
        {x: x, y: y + 1},
        {x: x, y: y - 1},
      ];
      for (const n of neighbors) {
        if (this.inBounds(n.x, n.y)) {
          const blockType = this.getBlockType(n.x, n.y);
          let newLight;
          if (!blockType || blockType.id === 'air') {
            newLight = Math.max(0, light - 1);
          } else if (blockType.solid) {
            const opacity = blockType.opacity !== undefined ? blockType.opacity : 1;
            newLight = Math.max(0, light - 1 - opacity);
          } else {
            newLight = Math.max(0, light - 1);
          }
          if (newLight > this.getLight(n.x, n.y)) {
            queue.push({x: n.x, y: n.y, light: newLight});
          }
        }
      }
    }
  }

  updateLighting(x, y) {
    if (!this._lastLightUpdate) this._lastLightUpdate = 0;
    if (this.time - this._lastLightUpdate < 0.1) return;
    
    this._lastLightUpdate = this.time;
    
    this.calculateSkyLight();
    
    this.calculateBlockLight();
    
    this.propagateLight();
  }





  initializeLighting() {
    this.calculateSkyLight();
    
    this.calculateBlockLight();
    
    this.propagateLight();
  }



  isSolidAt(x, y) {
    const t = this.getBlockType(x, y);
    return !!(t && t.solid);
  }

  tick(dt, time) {
    if (!this._lastPeriodicLightUpdate) this._lastPeriodicLightUpdate = 0;
    if (time - this._lastPeriodicLightUpdate > 60) {
      this.calculateSkyLight();
      
      this.calculateBlockLight();
      
      this.propagateLight();
      this._lastPeriodicLightUpdate = time;
    }
    
    if (Math.random() < 0.90) return;
    
    for (const chunkEntry of this.chunks.values()) {
      if (!chunkEntry || !chunkEntry.cells) continue;
      for (let rx = 0; rx < this.chunkSize; rx++) {
        const worldX = chunkEntry.chunkX * this.chunkSize + rx;
        for (let y = 0; y < this.height; y++) {
          const i = y * this.chunkSize + rx;
          const cell = chunkEntry.cells[i];
          if (!cell) continue;
          const t = this.registry.get(cell.id);
          if (t && typeof t.tick === 'function') {
            if (!cell.meta) cell.meta = {};
            t.tick(this, worldX, y, cell.meta, time);
          }
        }
      }
    }
  }

  findConnected(x, y, predicate) {
    const found = [];
    const q = [{x, y}];
    const visited = new Set([this.index(x, y)]);

    while (q.length > 0) {
      const {x, y} = q.shift();
      found.push({x, y});

      const neighbors = [
        {x: x + 1, y},
        {x: x - 1, y},
        {x: x, y: y + 1},
        {x: x, y: y - 1},
      ];

      for (const n of neighbors) {
        if (this.inBounds(n.x, n.y)) {
          const idx = this.index(n.x, n.y);
          if (!visited.has(idx)) {
            visited.add(idx);
            const cell = this.getCell(n.x, n.y);
            if (predicate(cell)) {
              q.push(n);
            }
          }
        }
      }
    }
    return found;
  }
}
