import { sampleBlockAt } from '../logic/terrainGen.js';
import { TILE_SIZE } from './utils.js';
import { WaterSim } from '../logic/water.js';

const LIGHT_SCALE = 2;
const MAX_LIGHT = 15 * LIGHT_SCALE;
const LIGHT_RADIUS = MAX_LIGHT;
const SOLID_LIGHT_COST = 3 * LIGHT_SCALE;
const BLOCK_LIGHT_AIR_COST = LIGHT_SCALE;
const SURFACE_SPAN = 3;
const MAX_GHOST_CHUNKS = 256;
const LIGHT_FLOW_SPEED = 45;
const LIGHT_FLOW_MAX_STEPS = 4;
const LIGHT_FADE_SPEED = 50 * LIGHT_SCALE;
const LIGHT_SOURCE_RISE = 8 * LIGHT_SCALE;
const AIR_CELL = Object.freeze({ id: 'air', meta: null });

// Seconds between falling-block ticks; sand and gravel count these to time their drops.
const FALL_TICK_INTERVAL = 0.06;
// Seconds between water simulation steps.
const WATER_STEP_INTERVAL = 0.02;

export class World {
  constructor(width, height, registry, seed = 0) {
    this.chunkSize = 5;
    this.width = width;
    this.height = height;
    this.widthInChunks = Math.ceil(width / this.chunkSize);
    this.registry = registry;
    this.chunks = new Map();
    this.loadedChunkOrder = [];
    this.maxLoadedChunks = 30;

    this.time = 0;
    this.dayLength = 1440;

    this.lightMap = new Uint8Array(width * height);
    this.blockLightMap = new Uint8Array(width * height);
    this.displaySky = new Float32Array(width * height);
    this.displayBlock = new Float32Array(width * height);

    this.stars = [];
    this.initializeStars();

    this.seed = seed;
    this.water = new WaterSim(this);

    this._savedEntities = new Map();
    this._crossChunkPending = new Map();
    this._savedChunks = new Map();
    this._pendingChunkLoads = new Map();
    this._chunkGeneration = 0;
    this._ghostCells = new Map();
    this._lightDirtyRanges = [];
    // Multiplayer: cells changed by another player in chunks we haven't loaded yet,
    // applied on top when the chunk loads. (chunkX -> Map(cell index -> cell))
    this._remoteEdits = new Map();
    // A multiplayer guest doesn't simulate (water, falling, furnaces...); the host does.
    this.remote = false;

    try {
      this._chunkWorker = new Worker('src/logic/chunkWorker.js', { type: 'module' });
      this._chunkWorker.onmessage = (e) => {
        const msg = e.data;
        // Drop chunks requested before a resetChunks() (e.g. /seed): they used the old seed.
        if (msg && msg.cmd === 'chunkGenerated' && msg.generation === this._chunkGeneration) {
          this._finishChunkLoad(msg.chunkX, msg.cells);
        }
      };
      this._chunkWorker.onerror = () => {
        this._chunkWorker = null;
        for (const chunkX of this._pendingChunkLoads.keys()) {
          this._generateChunkLocally(chunkX);
        }
      };
    } catch (err) {
      this._chunkWorker = null;
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

  dispose() {
    this.disposed = true;
    if (this._chunkWorker) {
      this._chunkWorker.terminate();
      this._chunkWorker = null;
    }
    this._pendingChunkLoads.clear();
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
    return x - this.chunkXFor(x) * this.chunkSize;
  }

  chunkKey(cx) {
    return String(cx);
  }

  isChunkLoaded(chunkX) {
    return this.chunks.has(this.chunkKey(chunkX));
  }

  loadChunkAsync(chunkX) {
    const key = this.chunkKey(chunkX);
    const existing = this.chunks.get(key);
    if (existing && existing.cells) {
      this._touchChunkLRU(chunkX);
      return Promise.resolve(existing);
    }

    const pending = this._pendingChunkLoads.get(chunkX);
    if (pending) return pending.promise;

    let resolveLoad;
    let rejectLoad;
    const promise = new Promise((res, rej) => {
      resolveLoad = res;
      rejectLoad = rej;
    });
    this._pendingChunkLoads.set(chunkX, { resolve: resolveLoad, reject: rejectLoad, promise });

    if (this._chunkWorker) {
      this._chunkWorker.postMessage({
        cmd: 'generateChunk',
        chunkX,
        chunkSize: this.chunkSize,
        height: this.height,
        seed: this.seed ?? 0,
        worldWidth: this.width,
        worldType: this.worldType || 'regular',
        superflatLayers: this.superflatLayers || null,
        generation: this._chunkGeneration
      });
    } else {
      setTimeout(() => this._generateChunkLocally(chunkX), 0);
    }

    return promise;
  }

  _generateChunkLocally(chunkX) {
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
      this._finishChunkLoad(chunkX, cells);
    } catch (err) {
      const pending = this._pendingChunkLoads.get(chunkX);
      this._pendingChunkLoads.delete(chunkX);
      if (pending) pending.reject(err);
    }
  }

  _finishChunkLoad(chunkX, cells) {
    const pendingLoad = this._pendingChunkLoads.get(chunkX);
    if (!pendingLoad) return;
    this._pendingChunkLoads.delete(chunkX);

    const chunk = { chunkX, cells, dirty: false };
    const saved = this._savedChunks.get(chunkX);
    if (saved && saved.length === cells.length) {
      chunk.cells = saved;
      chunk.dirty = true;
      this._savedChunks.delete(chunkX);
    }

    const edits = this._remoteEdits.get(chunkX);
    if (edits) {
      for (const [idx, cell] of edits) chunk.cells[idx] = cell;
      chunk.dirty = true;
      this._remoteEdits.delete(chunkX);
    }

    const pendingBlocks = this._crossChunkPending.get(chunkX);
    if (pendingBlocks) {
      for (const p of pendingBlocks) {
        const rx = p.x - chunkX * this.chunkSize;
        if (rx >= 0 && rx < this.chunkSize && p.y >= 0 && p.y < this.height) {
          const idx = p.y * this.chunkSize + rx;
          const current = chunk.cells[idx];
          if (!current || current.id === 'air') {
            chunk.cells[idx] = { id: p.id, meta: p.meta ?? null };
            chunk.dirty = true;
          }
        }
      }
      this._crossChunkPending.delete(chunkX);
    }

    this.chunks.set(this.chunkKey(chunkX), chunk);
    this._ghostCells.delete(chunkX);
    this._touchChunkLRU(chunkX);
    this._enforceChunkLimit();

    const startX = chunkX * this.chunkSize;
    this.relightRange(startX, startX + this.chunkSize - 1);
    this.syncDisplayLight(startX, startX + this.chunkSize - 1);

    pendingLoad.resolve(chunk);
  }

  _touchChunkLRU(chunkX) {
    const order = this.loadedChunkOrder;
    if (order[order.length - 1] === chunkX) return;
    const idx = order.indexOf(chunkX);
    if (idx !== -1) order.splice(idx, 1);
    order.push(chunkX);
  }

  _enforceChunkLimit() {
    while (this.loadedChunkOrder.length > this.maxLoadedChunks) {
      this.unloadChunk(this.loadedChunkOrder[0]);
    }
  }

  setChunk(chunkX, cells, dirty = true) {
    this.chunks.set(this.chunkKey(chunkX), { chunkX, cells, dirty });
    this._touchChunkLRU(chunkX);
  }

  resetChunks() {
    this._chunkGeneration++;
    this.chunks.clear();
    this.loadedChunkOrder.length = 0;
    this._savedChunks.clear();
    this._ghostCells.clear();
    this._savedEntities.clear();
    this._crossChunkPending.clear();
    this._remoteEdits.clear();
    this._pendingChunkLoads.clear();
    this._lightDirtyRanges.length = 0;
    this.lightMap.fill(0);
    this.blockLightMap.fill(0);
    this.displaySky.fill(0);
    this.displayBlock.fill(0);
  }

  unloadChunk(chunkX) {
    const key = this.chunkKey(chunkX);

    if (Array.isArray(this.items)) {
      const minX = chunkX * this.chunkSize;
      const maxX = minX + this.chunkSize;
      const toSave = [];
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        if (!it) continue;
        const tileX = Math.floor((it.x + (it.width || 0) / 2) / TILE_SIZE);
        if (tileX >= minX && tileX < maxX) {
          toSave.push({
            blockId: it.blockId,
            x: it.x,
            y: it.y,
            vx: it.vx,
            vy: it.vy,
            life: it.life,
            age: it.age ?? 0,
            count: it.count || 1
          });
          this.items.splice(i, 1);
        }
      }
      if (toSave.length > 0) {
        this._savedEntities.set(chunkX, (this._savedEntities.get(chunkX) || []).concat(toSave));
      }
    }

    const chunk = this.chunks.get(key);
    if (chunk && chunk.cells && chunk.dirty) {
      this._savedChunks.set(chunkX, chunk.cells);
    }
    if (chunk && chunk.cells) {
      this._ghostCells.delete(chunkX);
      this._ghostCells.set(chunkX, chunk.cells);
      if (this._ghostCells.size > MAX_GHOST_CHUNKS) {
        this._ghostCells.delete(this._ghostCells.keys().next().value);
      }
    }
    this.chunks.delete(key);

    const idx = this.loadedChunkOrder.indexOf(chunkX);
    if (idx !== -1) this.loadedChunkOrder.splice(idx, 1);
  }

  fetchSavedEntitiesForChunk(chunkX) {
    const arr = this._savedEntities.get(chunkX) || [];
    this._savedEntities.delete(chunkX);
    return arr;
  }

  getAllModifiedChunks() {
    const result = new Map(this._savedChunks);
    for (const chunk of this.chunks.values()) {
      if (chunk && chunk.cells) result.set(chunk.chunkX, chunk.cells);
    }
    return result;
  }

  getAllSavedEntities() {
    const result = [];
    for (const list of this._savedEntities.values()) result.push(...list);
    return result;
  }

  // Mark a cell as changed after editing its meta in place (no lighting update).
  touchCell(x, y) {
    const chunk = this.chunks.get(this.chunkKey(this.chunkXFor(x)));
    if (chunk) chunk.dirty = true;
    if (this.onBlockChanged) this.onBlockChanged(x, y);
  }

  getCell(x, y) {
    if (!this.inBounds(x, y)) return AIR_CELL;
    const chunk = this.chunks.get(this.chunkKey(Math.floor(x / this.chunkSize)));
    if (!chunk || !chunk.cells) return AIR_CELL;
    const rx = x - chunk.chunkX * this.chunkSize;
    return chunk.cells[y * this.chunkSize + rx] ?? AIR_CELL;
  }

  getBlockId(x, y) {
    return this.getCell(x, y).id;
  }

  getBlockType(x, y) {
    return this.registry.get(this.getCell(x, y).id);
  }

  setBlock(x, y, id, meta = null) {
    if (!this.inBounds(x, y)) return;
    const cx = this.chunkXFor(x);
    const chunk = this.chunks.get(this.chunkKey(cx));

    if (chunk && chunk.cells) {
      const rx = x - cx * this.chunkSize;
      // Clearing a plant that water was flowing through leaves the water behind.
      const old = chunk.cells[y * this.chunkSize + rx];
      if (id === 'air' && old?.meta?.water > 0) {
        id = 'water';
        meta = { mass: old.meta.water };
      }
      // A block in front of a background block keeps it (meta.bgId); clearing the front
      // block puts the background block back. A mined-out natural wall stays gone.
      const keepBg = old?.meta?.bgId;
      const keepNoWall = old?.meta?.noWall;
      if (keepBg && meta?.layer !== 'bg') {
        if (id === 'air') { id = keepBg; meta = { layer: 'bg' }; }
        else if (!meta?.bgId) meta = { ...(meta || {}), bgId: keepBg };
      } else if (keepNoWall && !meta?.noWall) {
        meta = { ...(meta || {}), noWall: true };
      }
      chunk.cells[y * this.chunkSize + rx] = { id, meta };
      chunk.dirty = true;
      this.blockVersion = (this.blockVersion || 0) + 1;
      this.updateLighting(x, y);
      this.water?.wakeAround(x, y);
      if (this.onBlockChanged) this.onBlockChanged(x, y);
    } else {
      if (!this._crossChunkPending.has(cx)) {
        this._crossChunkPending.set(cx, []);
      }
      this._crossChunkPending.get(cx).push({ x, y, id, meta });
    }
  }

  // Multiplayer: set a cell to what another player has, wherever its chunk is (loaded,
  // unloaded but saved, or not generated yet). If it's the same block, its meta is updated
  // in place so open chests and furnaces keep showing the live contents.
  applyRemoteCell(x, y, id, meta) {
    if (!this.inBounds(x, y)) return;
    const cx = this.chunkXFor(x);
    const idx = y * this.chunkSize + (x - cx * this.chunkSize);
    const chunk = this.chunks.get(this.chunkKey(cx));
    const cells = chunk?.cells || this._savedChunks.get(cx);
    if (!cells) {
      if (!this._remoteEdits.has(cx)) this._remoteEdits.set(cx, new Map());
      this._remoteEdits.get(cx).set(idx, { id, meta });
      this._ghostCells.delete(cx);
      return;
    }
    const old = cells[idx];
    if (old && old.id === id && old.meta && meta && typeof old.meta === 'object') {
      for (const k of Object.keys(old.meta)) if (!(k in meta)) delete old.meta[k];
      for (const [k, v] of Object.entries(meta)) {
        if (Array.isArray(old.meta[k]) && Array.isArray(v)) old.meta[k].splice(0, old.meta[k].length, ...v);
        else old.meta[k] = v;
      }
    } else {
      cells[idx] = { id, meta };
    }
    if (!chunk) return;
    chunk.dirty = true;
    this.blockVersion = (this.blockVersion || 0) + 1;
    if (!old || old.id !== id) {
      this.updateLighting(x, y);
      this.water?.wakeAround(x, y);
    }
  }

  getLight(x, y) {
    if (!this.inBounds(x, y)) return 0;
    const idx = this.index(x, y);
    return Math.max(this.lightMap[idx], this.blockLightMap[idx]) / LIGHT_SCALE;
  }

  getSkyLight(x, y) {
    if (!this.inBounds(x, y)) return 0;
    return this.lightMap[this.index(x, y)] / LIGHT_SCALE;
  }

  getBlockLight(x, y) {
    if (!this.inBounds(x, y)) return 0;
    return this.blockLightMap[this.index(x, y)] / LIGHT_SCALE;
  }

  setLight(x, y, light) {
    if (!this.inBounds(x, y)) return;
    this.lightMap[this.index(x, y)] = Math.max(0, Math.min(MAX_LIGHT, light * LIGHT_SCALE));
  }

  _isOpaque(type) {
    return !!type && !!type.solid && (type.opacity === undefined || type.opacity >= 1);
  }

  _lightAttenuation(type) {
    if (!type || !type.solid) return 1;
    const opacity = type.opacity !== undefined ? type.opacity : 1;
    if (opacity >= 1) return SOLID_LIGHT_COST;
    return LIGHT_SCALE + Math.floor(MAX_LIGHT * opacity);
  }

  updateLighting(x) {
    this._lightDirtyRanges.push(x - LIGHT_RADIUS, x + LIGHT_RADIUS);
  }

  flushLighting(force = false) {
    const ranges = this._lightDirtyRanges;
    if (ranges.length === 0) return;
    // Relighting is costly: bursts of edits (an explosion's rings, falling sand) are
    // gathered up and relit together a few times a second rather than every frame.
    const now = performance.now();
    if (!force && now - (this._lastLightFlush || 0) < 70) return;
    this._lastLightFlush = now;
    const pairs = [];
    for (let i = 0; i < ranges.length; i += 2) pairs.push([ranges[i], ranges[i + 1]]);
    ranges.length = 0;
    pairs.sort((a, b) => a[0] - b[0]);
    let [start, end] = pairs[0];
    for (let i = 1; i < pairs.length; i++) {
      const [s, e] = pairs[i];
      if (s <= end + 1) {
        end = Math.max(end, e);
      } else {
        this.relightRange(start, end);
        start = s;
        end = e;
      }
    }
    this.relightRange(start, end);
  }

  relightRange(x0, x1) {
    x0 = Math.max(0, x0);
    x1 = Math.min(this.width - 1, x1);
    if (x1 < x0) return;

    const { width, height, lightMap, blockLightMap, chunkSize } = this;

    const groundCache = new Map();
    const groundAt = (x) => {
      if (!groundCache.has(x)) groundCache.set(x, this._groundHeight(x));
      return groundCache.get(x);
    };

    for (let x = x0; x <= x1; x++) {
      const chunk = this.chunks.get(this.chunkKey(Math.floor(x / chunkSize)));
      if (!chunk || !chunk.cells) continue;
      const rx = x - chunk.chunkX * chunkSize;
      const own = groundAt(x);
      let leftMin = Infinity;
      let rightMin = Infinity;
      for (let d = 1; d <= SURFACE_SPAN; d++) {
        const l = groundAt(x - d);
        const r = groundAt(x + d);
        if (l !== null && l < leftMin) leftMin = l;
        if (r !== null && r < rightMin) rightMin = r;
      }
      const surface = Math.min(own, Math.max(leftMin, rightMin));
      let sky = MAX_LIGHT;
      for (let y = 0; y < height; y++) {
        const cell = chunk.cells[y * chunkSize + rx];
        const type = cell ? this.registry.get(cell.id) : null;
        if (sky > 0 && y > surface && !(type && type.solid)) sky = Math.max(0, sky - 1);
        lightMap[y * width + x] = sky;
        blockLightMap[y * width + x] = 0;
        if (sky > 0 && type && type.solid) {
          sky = this._isOpaque(type) ? 0 : Math.max(0, sky - Math.floor(MAX_LIGHT * (type.opacity || 0)));
        }
      }
    }

    const skyQueue = [];
    const blockQueue = [];
    const seedStart = Math.max(0, x0 - LIGHT_RADIUS);
    const seedEnd = Math.min(width - 1, x1 + LIGHT_RADIUS);
    for (let x = seedStart; x <= seedEnd; x++) {
      const chunkX = Math.floor(x / chunkSize);
      const loaded = this.isChunkLoaded(chunkX);
      const cells = this._lightCellsFor(chunkX);
      if (!cells) continue;
      const rx = x - chunkX * chunkSize;
      for (let y = 0; y < height; y++) {
        const idx = y * width + x;
        if (lightMap[idx] > 1) skyQueue.push(idx);
        if (!loaded) {
          if (blockLightMap[idx] > 1) blockQueue.push(idx);
          continue;
        }
        const cell = cells[y * chunkSize + rx];
        const type = cell ? this.registry.get(cell.id) : null;
        const emitted = type && type.lightLevel > 0 ? Math.min(MAX_LIGHT, type.lightLevel * LIGHT_SCALE) : 0;
        if (emitted > 0) {
          if (emitted > blockLightMap[idx]) blockLightMap[idx] = emitted;
          blockQueue.push(idx);
        }
      }
    }

    this._spreadLight(lightMap, skyQueue, 1);
    this._spreadLight(blockLightMap, blockQueue, BLOCK_LIGHT_AIR_COST);
  }

  _lightCellsFor(chunkX) {
    const chunk = this.chunks.get(this.chunkKey(chunkX));
    if (chunk && chunk.cells) return chunk.cells;
    return this._ghostCells.get(chunkX) || null;
  }

  _lightTypeAt(x, y) {
    const chunkX = Math.floor(x / this.chunkSize);
    const cells = this._lightCellsFor(chunkX);
    if (!cells) return null;
    const cell = cells[y * this.chunkSize + (x - chunkX * this.chunkSize)];
    return cell ? this.registry.get(cell.id) : null;
  }

  _groundHeight(x) {
    if (x < 0 || x >= this.width) return null;
    const chunkX = Math.floor(x / this.chunkSize);
    const cells = this._lightCellsFor(chunkX);
    if (!cells) return null;
    const rx = x - chunkX * this.chunkSize;
    for (let y = 0; y < this.height; y++) {
      const cell = cells[y * this.chunkSize + rx];
      if (this._isOpaque(cell ? this.registry.get(cell.id) : null)) return y;
    }
    return this.height;
  }

  _spreadLight(map, queue, airCost) {
    const { width, height, chunkSize } = this;
    for (let head = 0; head < queue.length; head++) {
      const idx = queue[head];
      const light = map[idx];
      if (light <= 1) continue;
      const x = idx % width;
      const y = (idx - x) / width;
      const sourceType = this._lightTypeAt(x, y);
      const sourceOpaque = this._isOpaque(sourceType) && !(sourceType?.lightLevel > 0);
      for (let n = 0; n < 4; n++) {
        const nx = n === 0 ? x + 1 : n === 1 ? x - 1 : x;
        const ny = n === 2 ? y + 1 : n === 3 ? y - 1 : y;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (!this.isChunkLoaded(Math.floor(nx / chunkSize))) continue;
        const type = this.getBlockType(nx, ny);
        const opaque = this._isOpaque(type);
        const cost = sourceOpaque
          ? SOLID_LIGHT_COST
          : opaque ? airCost : Math.max(airCost, this._lightAttenuation(type) - LIGHT_SCALE + airCost);
        const newLight = light - cost;
        const nIdx = ny * width + nx;
        if (newLight > map[nIdx]) {
          map[nIdx] = newLight;
          if (newLight > 1) queue.push(nIdx);
        }
      }
    }
  }

  syncDisplayLight(x0, x1) {
    x0 = Math.max(0, x0);
    x1 = Math.min(this.width - 1, x1);
    for (let y = 0; y < this.height; y++) {
      const row = y * this.width;
      for (let x = x0; x <= x1; x++) {
        this.displaySky[row + x] = this.lightMap[row + x];
        this.displayBlock[row + x] = this.blockLightMap[row + x];
      }
    }
  }

  updateDisplayLight(dt, x0, x1, y0, y1) {
    x0 = Math.max(0, x0);
    x1 = Math.min(this.width - 1, x1);
    y0 = Math.max(0, y0);
    y1 = Math.min(this.height - 1, y1);
    if (x1 < x0 || y1 < y0) return;

    this._flowAccum = Math.min(LIGHT_FLOW_MAX_STEPS, (this._flowAccum || 0) + dt * LIGHT_FLOW_SPEED);
    const steps = Math.floor(this._flowAccum);
    this._flowAccum -= steps;
    const fade = dt * LIGHT_FADE_SPEED;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (!this._flowScratch || this._flowScratch.length < w * h) this._flowScratch = new Float32Array(w * h);
    const scratch = this._flowScratch;

    for (const [display, target] of [[this.displaySky, this.lightMap], [this.displayBlock, this.blockLightMap]]) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const idx = y * this.width + x;
          if (display[idx] > target[idx]) display[idx] = Math.max(target[idx], display[idx] - fade);
        }
      }
      for (let step = 0; step < steps; step++) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) scratch[(y - y0) * w + (x - x0)] = display[y * this.width + x];
        }
        const read = (x, y) => (x < x0 || x > x1 || y < y0 || y > y1)
          ? display[y * this.width + x] || 0
          : scratch[(y - y0) * w + (x - x0)];
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const idx = y * this.width + x;
            const goal = target[idx];
            const current = scratch[(y - y0) * w + (x - x0)];
            if (current >= goal) continue;
            const neighbor = Math.max(
              x > 0 ? read(x - 1, y) : 0,
              x < this.width - 1 ? read(x + 1, y) : 0,
              y > 0 ? read(x, y - 1) : 0,
              y < this.height - 1 ? read(x, y + 1) : 0
            );
            const neighborGoal = Math.max(
              x > 0 ? target[idx - 1] : 0,
              x < this.width - 1 ? target[idx + 1] : 0,
              y > 0 ? target[idx - this.width] : 0,
              y < this.height - 1 ? target[idx + this.width] : 0
            );
            const rise = goal >= neighborGoal ? current + LIGHT_SOURCE_RISE : current;
            display[idx] = Math.min(goal, Math.max(rise, neighbor - 1));
          }
        }
      }
    }
  }

  getDisplaySkyLight(x, y) {
    if (!this.inBounds(x, y)) return 0;
    return this.displaySky[this.index(x, y)] / LIGHT_SCALE;
  }

  getDisplayBlockLight(x, y) {
    if (!this.inBounds(x, y)) return 0;
    return this.displayBlock[this.index(x, y)] / LIGHT_SCALE;
  }

  initializeLighting() {
    this._lightDirtyRanges.length = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const chunk of this.chunks.values()) {
      minX = Math.min(minX, chunk.chunkX * this.chunkSize);
      maxX = Math.max(maxX, (chunk.chunkX + 1) * this.chunkSize - 1);
    }
    if (minX <= maxX) {
      this.relightRange(minX, maxX);
      this.syncDisplayLight(minX, maxX);
    }
  }

  isSolidAt(x, y) {
    const t = this.getBlockType(x, y);
    if (!t) return false;
    if (typeof t.isSolid === 'function') {
      return t.isSolid(this.getCell(x, y).meta);
    }
    return !!t.solid;
  }

  tick(dt) {
    if (this.remote) {
      this.flushLighting();
      return;
    }
    // Falling blocks tick on a fixed clock so they drop at a steady pace;
    // everything else keeps the old random ~10%-of-frames cadence.
    this._waterAccum = (this._waterAccum || 0) + dt;
    // Catch up a few steps on slow frames so water keeps its real-time speed.
    for (let n = 0; n < 3 && this._waterAccum >= WATER_STEP_INTERVAL; n++) {
      this._waterAccum -= WATER_STEP_INTERVAL;
      this.water.step();
    }
    this._waterAccum = Math.min(this._waterAccum, WATER_STEP_INTERVAL);
    this._fallAccum = (this._fallAccum || 0) + dt;
    const fallDue = this._fallAccum >= FALL_TICK_INTERVAL;
    if (fallDue) this._fallAccum = Math.min(this._fallAccum - FALL_TICK_INTERVAL, FALL_TICK_INTERVAL);
    const slowDue = Math.random() < 0.1;
    if (!fallDue && !slowDue) {
      this.flushLighting();
      return;
    }

    const time = this.time;
    const pending = [];
    for (const chunk of this.chunks.values()) {
      if (!chunk || !chunk.cells) continue;
      for (let i = 0; i < chunk.cells.length; i++) {
        const cell = chunk.cells[i];
        if (!cell) continue;
        const t = this.registry.get(cell.id);
        if (t && typeof t.tick === 'function' && (t.falls ? fallDue : slowDue)) pending.push(chunk, i, cell, t);
      }
    }

    for (let p = 0; p < pending.length; p += 4) {
      const chunk = pending[p];
      const i = pending[p + 1];
      const cell = pending[p + 2];
      if (chunk.cells[i] !== cell || this.chunks.get(this.chunkKey(chunk.chunkX)) !== chunk) continue;
      const rx = i % this.chunkSize;
      const y = (i - rx) / this.chunkSize;
      if (!cell.meta) cell.meta = {};
      pending[p + 3].tick(this, chunk.chunkX * this.chunkSize + rx, y, cell.meta, time);
    }
    this.flushLighting();
  }
}
