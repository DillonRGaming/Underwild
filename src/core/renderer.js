import { TILE_SIZE, darkenHex } from './utils.js';
import { naturalHeightAt, naturalDirtDepthAt } from '../logic/terrainGen.js';
import { grassColorAt, leafColorAt, biomeHasLeafTint, ROCK_SCALES } from '../logic/biomes.js';

const MIN_BRIGHTNESS = 0.04;
const NIGHT_SKY = [3, 4, 9];
const NIGHT_LIGHT = 0.07;
const BACKGROUND_WALL = 'rgb(58, 46, 36)';
const BACKGROUND_WALL_SHADE = 0.4;
const HELD_TORCH_LIGHT = 10.5;
const HELD_LIGHT_RANGE = 32;
const HELD_LIGHT_WALL_COST = 6.5;
const HELD_LIGHT_KEY = 1 << 16;
const PLACED_LIGHT_RANGE = 44;
const PLACED_LIGHT_BRIGHTNESS = 0.85;
const WHITE_LIGHT = [1, 1, 1];
const LIGHT_TINT_STRENGTH = 0.9;
const LIGHT_GLOW_STRENGTH = 0.35;
const OPEN_AIR_LIGHT_COST = 4;
const OPEN_AIR_TINT = 0.25;
const LIGHT_TINT_FULL = 8;
const PLACED_LIGHT_WALL_COST = 8;
const PLACED_LIGHT_MARGIN = 16;
const LIGHT_EDGE_FADE = 5;
const HELD_ARM_ANGLE = -0.7;
const HELD_ARM_LOOK = 0.2;
const HELD_ARM_WALK = 0.25;
// Blocks whose green pixels take on the local biome's grass colour.
const BIOME_TINTED = new Set(['grass', 'short_grass', 'fern', 'flower_short_grass', 'bush', 'grass_tuft', 'bush_1', 'bush_2', 'bush_3', 'bush_4']);
const LEAF_FRINGE_DEPTH = 2;

function isGreenPixel(d, i) {
  return d[i + 3] !== 0 && d[i + 1] > d[i] && d[i + 1] > d[i + 2];
}
const LEAF_FRINGE_SIDES = [['top', 0, -1], ['bottom', 0, 1], ['left', -1, 0], ['right', 1, 0]];
const TOOL_GRIP_ANGLE = 45 * Math.PI / 180;
const MINE_BOB_SPEED = 0.018;
const MINE_BOB_AMOUNT = 0.25;
// How far each held tool sits out along its handle, as a fraction of its size.
const TOOL_GRIP_OFFSETS = { sword: 0.36, pickaxe: 0.26, axe: 0.26, shovel: 0.26, hoe: 0.26, stick: 0.3, trowel: 0.18 };
const ARM_ACTIONS = {
  // duration in ms; curve(t) returns the arm angle offset for t in [0, 1]
  attack: { duration: 260, curve: t => t < 0.3 ? -1.4 * (t / 0.3) : -1.4 + 2.0 * Math.sin(((t - 0.3) / 0.7) * Math.PI / 2) * (1 - (t - 0.3) / 0.7 * 0.3) },
  place: { duration: 180, curve: t => -0.45 * Math.sin(t * Math.PI) }
};
const CROUCH_HIP_BACK = 0.1;
const CROUCH_SINK = 0.2;
const CROUCH_TORSO_BACK = 0.12;
const CROUCH_LEAN = 0.35;
const WALL_TORCH_ANGLE = Math.PI / 6;

export class Renderer {
  constructor(ctx, canvas, world, registry, camera, input, player, inventory, breaker, getUI) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.world = world;
    this.registry = registry;
    this.camera = camera;
    this.input = input;
    this.player = player;
    this.inventory = inventory;
    this.breaker = breaker;
    this.getUI = getUI;
    this._layoutCache = null;
    this._imageCache = new Map();
    this.textures = {};
    this.missingTextures = new Set();
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
  }

  preloadTextures() {
    const backgroundBlocks = Array.isArray(window.backgroundBlocks) ? window.backgroundBlocks : ['dirt', 'coarse_dirt'];
    const ids = new Set([...backgroundBlocks, 'dirt', 'coarse_dirt', 'stone', 'grass']);
    for (const id of this.registry.map.keys()) ids.add(id);
    for (const id of this.registry.map.keys()) if (id.endsWith('_leaves')) ids.add(`falling_leaf_${id}`);
    for (const id of this.registry.map.keys()) if (id.endsWith('_chest')) ids.add(`${id}_left`).add(`${id}_right`);
    for (const id of ['oak_leaf_particle', 'falling_leaf', 'steve', 'no_texture', 'bush_1', 'bush_2', 'bush_3', 'bush_4']) ids.add(id);

    for (const textureId of ids) {
      if (textureId === 'air' || this.textures[textureId]) continue;
      const image = new Image();
      image.onload = () => {
        this.textures[textureId] = image;
      };
      image.onerror = () => {
        this.missingTextures.add(textureId);
      };
      image.src = `textures/${textureId}.png`;
    }
  }

  clear(r, g, b, a) {
    const { ctx, canvas } = this;
    ctx.fillStyle = `rgba(${Math.floor(r * 255)}, ${Math.floor(g * 255)}, ${Math.floor(b * 255)}, ${a})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  render() {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    const { ctx, canvas, world, camera } = this;
    const ui = this.getUI();
    ctx.imageSmoothingEnabled = false;

    if (ui?.isLoading) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px "MovType", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Loading World...', canvas.width / 2, canvas.height / 2);
      return;
    }

    if (!world || (!ui?.gamePaused && document.querySelector('.menu-container:not(.hidden)'))) {
      this.renderMenuBackground();
      return;
    }

    this.updateDaylight();
    this.updateHeldLight(ui);
    this.drawSky();

    const shake = ui?.explosionFX ? ui.explosionFX.getShakeOffset() : null;
    if (shake && (shake.x || shake.y)) {
      ctx.save();
      ctx.translate(Math.round(shake.x), Math.round(shake.y));
    }

    const viewW = canvas.width / camera.zoom;
    const viewH = canvas.height / camera.zoom;
    
    const margin = 2;
    const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE) - margin);
    const endX = Math.min(this.world.width - 1, Math.ceil((camera.x + viewW) / TILE_SIZE) + margin);
    const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE) - margin);
    const endY = Math.min(this.world.height - 1, Math.ceil((camera.y + viewH) / TILE_SIZE) + margin);

    const lightNow = performance.now();
    const lightDt = this._lastLightTime ? Math.min(0.1, (lightNow - this._lastLightTime) / 1000) : 0;
    this._lastLightTime = lightNow;
    world.updateDisplayLight(lightDt, startX - 1, endX + 1, startY - 1, endY + 1);
    this.updatePlacedLight(startX, endX, startY, endY);

    for (let x = startX; x <= endX; x++) {
      if (!world.isChunkLoaded(world.chunkXFor(x))) continue;
      for (let y = startY; y <= endY; y++) {
        const cell = world.getCell(x, y);
        const t = this.registry.get(cell.id);
        if (!t) continue;
        if (!t.solid || cell.id === 'air') {
          if (!this.isOpenSky(x, y)) this.drawBackgroundWall(x, y, ui?.textureQuality === 'fast');
          if (cell.id === 'air') continue;
        }
        this.drawBlock(x, y, t, cell.meta || {});
      }
    }

    this.drawLeafFringes(startX, endX, startY, endY);

    this.drawLightOverlay(startX, endX, startY, endY);
    if (ui?.textureQuality !== 'fast') this.drawLightTint(startX, endX, startY, endY);
    this.drawBreakingProgress();
    this.drawPlayer();
    this.drawLeafParticles();
    this.drawItems();
    this.drawPrimedExplosives(ui?.primedExplosives);
    if (ui?.explosionFX) ui.explosionFX.draw(ctx, camera);
    this.drawHoveredBlockOutline();
    this.drawPositionOutlines();
    if (shake && (shake.x || shake.y)) ctx.restore();
  }

  updateDaylight() {
    const world = this.world;
    const timeOfDay = (world.time % world.dayLength) / world.dayLength;
    const sunPhase = (timeOfDay - 0.25 + 1) % 1;
    const sunVisible = sunPhase <= 0.5;
    const travelT = sunVisible ? sunPhase / 0.5 : (sunPhase - 0.5) / 0.5;
    const s = Math.sin(Math.PI * travelT);
    this.daylight = { sunVisible, travelT, base: sunVisible ? 0.5 + 0.5 * s : 0.5 - (0.5 - NIGHT_LIGHT) * Math.min(1, s * 3) };
  }

  lightFactorAt(tileX, tileY, dayBoost) {
    const world = this.world;
    const { base, sunVisible } = this.daylight;
    const ambient = sunVisible ? Math.min(1, base * 1.8) : base;
    const sky = (world.getDisplaySkyLight(tileX, tileY) / 15) * ambient;
    return Math.min(1, Math.max(MIN_BRIGHTNESS, sky, this.blockLightFactor(tileX, tileY)));
  }

  getHeldSlot(ui = this.getUI?.()) {
    const inv = this.inventory || window.inventory;
    if (!inv || typeof inv.getSlot !== 'function') return null;
    const index = Number.isInteger(ui?.selectedIndex) ? ui.selectedIndex : 0;
    return inv.getSlot(index);
  }

  updateHeldLight(ui) {
    this.heldLight = null;
    this.heldLightColor = null;
    const player = this.player;
    if (!player) return;
    const slot = this.getHeldSlot(ui);
    const type = this.registry.get(slot?.blockId || slot?.itemId);
    if (type?.shape !== 'torch') return;
    this.heldLightColor = type.lightColor || null;
    this.heldLight = this.floodHeldLight(
      (player.x + player.width / 2) / TILE_SIZE,
      (player.y + player.height * 0.4) / TILE_SIZE,
      HELD_LIGHT_RANGE
    );
  }

  heldLightCost(tileX, tileY, wallCost = HELD_LIGHT_WALL_COST) {
    const world = this.world;
    if (!world.inBounds(tileX, tileY)) return Infinity;
    const type = world.getBlockType(tileX, tileY);
    const cell = world.getCell(tileX, tileY);
    if (type && type.solid && type.opacity !== 0 && cell.meta?.layer !== 'bg') return wallCost;
    return world.getSkyLight(tileX, tileY) >= 15 || this.isOpenSky(tileX, tileY) ? OPEN_AIR_LIGHT_COST : 1;
  }

  floodHeldLight(originX, originY, level, wallCost = HELD_LIGHT_WALL_COST) {
    const levels = new Map();
    const queue = [];
    const baseX = Math.floor(originX);
    const baseY = Math.floor(originY);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = baseX + dx;
        const ty = baseY + dy;
        const cost = this.heldLightCost(tx, ty, wallCost);
        if (cost === Infinity) continue;
        const dist = Math.abs(tx + 0.5 - originX) + Math.abs(ty + 0.5 - originY);
        const value = level - dist - (dx || dy ? cost - 1 : 0);
        if (value <= 0) continue;
        const key = tx * HELD_LIGHT_KEY + ty;
        if ((levels.get(key) ?? 0) >= value) continue;
        levels.set(key, value);
        queue.push(tx, ty, value);
      }
    }
    for (let head = 0; head < queue.length; head += 3) {
      const x = queue[head];
      const y = queue[head + 1];
      const value = queue[head + 2];
      if (levels.get(x * HELD_LIGHT_KEY + y) !== value) continue;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const next = value - this.heldLightCost(nx, ny, wallCost);
        if (next <= 0) continue;
        const key = nx * HELD_LIGHT_KEY + ny;
        if ((levels.get(key) ?? 0) >= next) continue;
        levels.set(key, next);
        queue.push(nx, ny, next);
      }
    }
    return levels;
  }

  updatePlacedLight(startX, endX, startY, endY) {
    const world = this.world;
    const key = `${world.blockVersion || 0}:${world.chunks.size}`;
    const c = this.placedLightCache;
    if (c && c.world === world && c.key === key && startX >= c.x0 && endX <= c.x1 && startY >= c.y0 && endY <= c.y1) return;
    const x0 = startX - PLACED_LIGHT_MARGIN;
    const x1 = endX + PLACED_LIGHT_MARGIN;
    const y0 = startY - PLACED_LIGHT_MARGIN;
    const y1 = endY + PLACED_LIGHT_MARGIN;
    const levels = new Map();
    const colors = new Map();
    let colored = false;
    for (let x = x0 - PLACED_LIGHT_RANGE; x <= x1 + PLACED_LIGHT_RANGE; x++) {
      if (x < 0 || x >= world.width || !world.isChunkLoaded(world.chunkXFor(x))) continue;
      for (let y = Math.max(0, y0 - PLACED_LIGHT_RANGE); y <= Math.min(world.height - 1, y1 + PLACED_LIGHT_RANGE); y++) {
        const type = world.getBlockType(x, y);
        if (!type || !(type.lightLevel > 0)) continue;
        const range = PLACED_LIGHT_RANGE * type.lightLevel / 15;
        const flood = this.floodHeldLight(x + 0.5, y + 0.5, range, PLACED_LIGHT_WALL_COST);
        const [r, g, b] = type.lightColor || WHITE_LIGHT;
        if (type.lightColor) colored = true;
        for (const [k, remaining] of flood) {
          const level = type.lightLevel * PLACED_LIGHT_BRIGHTNESS * Math.pow(remaining / range, 1.5);
          if (level > (levels.get(k) ?? 0)) levels.set(k, level);
          const sum = colors.get(k);
          if (sum) {
            sum[0] += r * level; sum[1] += g * level; sum[2] += b * level; sum[3] += level;
          } else {
            colors.set(k, [r * level, g * level, b * level, level]);
          }
        }
      }
    }
    this.placedLightCache = { world, key, x0, x1, y0, y1, levels, colors, colored };
  }

  lightTintAt(tileX, tileY, out) {
    const k = tileX * HELD_LIGHT_KEY + tileY;
    const sum = this.placedLightCache?.colors.get(k);
    let r = 0, g = 0, b = 0, w = 0, peak = 0;
    if (sum) {
      r = sum[0]; g = sum[1]; b = sum[2]; w = sum[3];
      peak = this.placedLightCache.levels.get(k) ?? 0;
    }
    const held = this.heldLightLevel(tileX, tileY);
    if (held > 0) {
      const [hr, hg, hb] = this.heldLightColor || WHITE_LIGHT;
      r += hr * held; g += hg * held; b += hb * held; w += held;
      peak = Math.max(peak, held);
    }
    out[0] = out[1] = out[2] = 255;
    out[3] = out[4] = out[5] = 0;
    if (w <= 0) return;
    const { base, sunVisible } = this.daylight;
    const ambient = sunVisible ? Math.min(1, base * 1.8) : base;
    const dark = 1 - Math.min(1, (this.world.getDisplaySkyLight(tileX, tileY) / 15) * ambient);
    if (dark <= 0) return;
    const cr = r / w, cg = g / w, cb = b / w;
    const openAir = this.isOpenSky(tileX, tileY);
    const amount = Math.min(1, peak / LIGHT_TINT_FULL) * dark * (openAir ? OPEN_AIR_TINT : 1);
    const strength = LIGHT_TINT_STRENGTH * amount;
    out[0] = Math.round(255 * (1 - (1 - cr) * strength));
    out[1] = Math.round(255 * (1 - (1 - cg) * strength));
    out[2] = Math.round(255 * (1 - (1 - cb) * strength));
    const glow = LIGHT_GLOW_STRENGTH * amount * (Math.max(cr, cg, cb) - Math.min(cr, cg, cb));
    out[3] = Math.round(255 * cr * glow);
    out[4] = Math.round(255 * cg * glow);
    out[5] = Math.round(255 * cb * glow);
  }

  drawLightTint(startX, endX, startY, endY) {
    if (!this.placedLightCache?.colored && !this.heldLightColor) return;
    const { ctx, camera } = this;
    const w = endX - startX + 1;
    const h = endY - startY + 1;
    if (!this._tintCanvas) {
      this._tintCanvas = document.createElement('canvas');
      this._tintCtx = this._tintCanvas.getContext('2d');
    }
    if (!this._glowCanvas) {
      this._glowCanvas = document.createElement('canvas');
      this._glowCtx = this._glowCanvas.getContext('2d');
    }
    if (this._tintCanvas.width !== w || this._tintCanvas.height !== h) {
      this._tintCanvas.width = this._glowCanvas.width = w;
      this._tintCanvas.height = this._glowCanvas.height = h;
      this._tintImage = this._tintCtx.createImageData(w, h);
      this._glowImage = this._glowCtx.createImageData(w, h);
    }
    const tint = this._tintImage.data;
    const glow = this._glowImage.data;
    const out = [255, 255, 255, 0, 0, 0];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        this.lightTintAt(startX + i, startY + j, out);
        const o = (j * w + i) * 4;
        tint[o] = out[0]; tint[o + 1] = out[1]; tint[o + 2] = out[2]; tint[o + 3] = 255;
        glow[o] = out[3]; glow[o + 1] = out[4]; glow[o + 2] = out[5]; glow[o + 3] = 255;
      }
    }
    this._tintCtx.putImageData(this._tintImage, 0, 0);
    this._glowCtx.putImageData(this._glowImage, 0, 0);
    const tilePx = TILE_SIZE * camera.zoom;
    const left = camera.worldToScreenX(startX * TILE_SIZE);
    const top = camera.worldToScreenY(startY * TILE_SIZE);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this._tintCanvas, left, top, w * tilePx, h * tilePx);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this._glowCanvas, left, top, w * tilePx, h * tilePx);
    ctx.restore();
  }

  placedLightLevel(tileX, tileY) {
    return this.placedLightCache?.levels.get(tileX * HELD_LIGHT_KEY + tileY) ?? 0;
  }

  heldLightLevel(tileX, tileY) {
    const remaining = this.heldLight?.get(tileX * HELD_LIGHT_KEY + tileY) ?? 0;
    if (remaining <= 0) return 0;
    return HELD_TORCH_LIGHT * Math.pow(remaining / HELD_LIGHT_RANGE, 1.5);
  }

  blockLightFactor(tileX, tileY) {
    const level = Math.max(this.placedLightLevel(tileX, tileY), this.heldLightLevel(tileX, tileY));
    if (level <= 0) return 0;
    const edge = Math.min(1, level / LIGHT_EDGE_FADE);
    return Math.min(1, Math.pow(level / 15, 0.6) * 1.15 * edge * edge);
  }

  isOpenSky(tileX, tileY) {
    const world = this.world;
    if (!world.inBounds(tileX, tileY) || world.getBlockType(tileX, tileY)?.solid) return false;
    return tileY < this.naturalSurfaceAt(tileX);
  }

  naturalSurfaceAt(tileX) {
    const world = this.world;
    if (this._surfaceWorld !== world) {
      this._surfaceWorld = world;
      this._surfaceCache = new Map();
    }
    let surface = this._surfaceCache.get(tileX);
    if (surface === undefined) {
      surface = naturalHeightAt(tileX, world.seed ?? 0, world.height, world.worldType);
      this._surfaceCache.set(tileX, surface);
    }
    return surface;
  }

  backgroundWallTexture(tileX, tileY) {
    const world = this.world;
    const depth = tileY - this.naturalSurfaceAt(tileX);
    const dirtDepth = naturalDirtDepthAt(tileX, world.seed ?? 0, world.worldType);
    return this.textures[depth <= dirtDepth ? 'dirt' : 'stone'] || null;
  }

  drawBackgroundWall(tileX, tileY, flat = false) {
    const { ctx, camera } = this;
    const left = Math.round(camera.worldToScreenX(tileX * TILE_SIZE));
    const top = Math.round(camera.worldToScreenY(tileY * TILE_SIZE));
    const width = Math.round(camera.worldToScreenX((tileX + 1) * TILE_SIZE)) - left;
    const height = Math.round(camera.worldToScreenY((tileY + 1) * TILE_SIZE)) - top;
    const texture = flat ? null : this.backgroundWallTexture(tileX, tileY);
    if (texture) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.getTintedTexture(texture, BACKGROUND_WALL_SHADE), left, top, width, height);
    } else {
      ctx.fillStyle = BACKGROUND_WALL;
      ctx.fillRect(left, top, width, height);
    }
  }

  isShadedTile(tileX, tileY) {
    const world = this.world;
    if (!world.isChunkLoaded(world.chunkXFor(tileX))) return false;
    return !this.isOpenSky(tileX, tileY);
  }

  overlayAlphaAt(tileX, tileY) {
    const world = this.world;
    if (!world.isChunkLoaded(world.chunkXFor(tileX))) return 0;
    if (this.isOpenSky(tileX, tileY)) return 0;
    return 1 - this.lightFactorAt(tileX, tileY, true);
  }

  drawLightOverlay(startX, endX, startY, endY) {
    const { ctx, camera } = this;
    ctx.save();
    ctx.fillStyle = '#000';
    for (let ty = startY; ty <= endY; ty++) {
      const top = Math.round(camera.worldToScreenY(ty * TILE_SIZE));
      const bottom = Math.round(camera.worldToScreenY((ty + 1) * TILE_SIZE));
      let runStart = null;
      let runAlpha = 0;
      for (let tx = startX; tx <= endX + 1; tx++) {
        let alpha = 0;
        if (tx <= endX && this.isShadedTile(tx, ty)) {
          alpha = Math.round(Math.max(0, Math.min(1, this.overlayAlphaAt(tx, ty))) * 255) / 255;
        }
        if (runStart !== null && alpha !== runAlpha) {
          const left = Math.round(camera.worldToScreenX(runStart * TILE_SIZE));
          ctx.globalAlpha = runAlpha;
          ctx.fillRect(left, top, Math.round(camera.worldToScreenX(tx * TILE_SIZE)) - left, bottom - top);
          runStart = null;
        }
        if (runStart === null && alpha > 0) {
          runStart = tx;
          runAlpha = alpha;
        }
      }
    }
    ctx.restore();
  }

  renderMenuBackground() {
    const { ctx, canvas } = this;
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const backgroundBlocks = window.backgroundBlocks || ['dirt', 'coarse_dirt'];
    
    if (backgroundBlocks.length > 0) {
      if (!this.menuBackgroundPatterns || 
          this.menuBackgroundPatterns.canvasWidth !== canvas.width || 
          this.menuBackgroundPatterns.canvasHeight !== canvas.height ||
          this.menuBackgroundPatterns.lastConfig !== JSON.stringify(backgroundBlocks)) {
        
        this.menuBackgroundPatterns = {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          grid: [],
          lastConfig: JSON.stringify(backgroundBlocks)
        };
        
        const tileSize = 64;
        
        const tilesX = Math.ceil(canvas.width / tileSize) + 1;
        const tilesY = Math.ceil(canvas.height / tileSize) + 1;
        
        for (let y = 0; y < tilesY; y++) {
          this.menuBackgroundPatterns.grid[y] = [];
          for (let x = 0; x < tilesX; x++) {
            const blockIndex = Math.floor(Math.random() * backgroundBlocks.length);
            this.menuBackgroundPatterns.grid[y][x] = backgroundBlocks[blockIndex];
          }
        }
      }
      
      const tileSize = 64;
      
      for (let x = 0; x < canvas.width + tileSize; x += tileSize) {
        for (let y = 0; y < canvas.height + tileSize; y += tileSize) {
          const tileX = Math.floor(x / tileSize);
          const tileY = Math.floor(y / tileSize);
          
          if (this.menuBackgroundPatterns.grid[tileY] && 
              this.menuBackgroundPatterns.grid[tileY][tileX]) {
            const blockId = this.menuBackgroundPatterns.grid[tileY][tileX];
            const texture = this.textures[blockId];
            
            if (texture) {
              ctx.drawImage(texture, x, y, tileSize, tileSize);
            } else {
              ctx.fillStyle = this.getBlockColor(blockId);
              ctx.fillRect(x, y, tileSize, tileSize);
            }
          }
        }
      }
    } else {
      ctx.fillStyle = '#2d1810';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = '#3d2810';
      for (let x = 0; x < canvas.width; x += 128) {
        for (let y = 0; y < canvas.height; y += 128) {
          if ((x + y) % 256 === 0) {
            ctx.fillRect(x, y, 128, 128);
          }
        }
      }
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  getBlockColor(blockId) {
    const blockColors = {
      'dirt': '#8B4513',
      'coarse_dirt': '#654321',
      'stone': '#808080',
      'grass': '#7CFC00',
      'sand': '#F4A460',
      'gravel': '#696969',
      'clay': '#CD853F',
      'mud': '#8B4513',
      'copper': '#B87333',
      'steel_ore': '#8E9AA6',
      'copper_ore': '#D8814A',
      'gold_ore': '#FFD700',
      'coal_ore': '#2F4F4F',
      'oak_log': '#8B4513',
      'birch_log': '#F5DEB3',
      'spruce_log': '#654321',
      'pine_log': '#3b2a20',
      'maple_log': '#CD853F',
      'oak_planks': '#DEB887',
      'birch_planks': '#F5DEB3',
      'spruce_planks': '#8B4513',
      'pine_planks': '#4a3528',
      'maple_planks': '#CD853F'
    };
    
    return blockColors[blockId] || '#8B4513';
  }

  drawSky() {
    const { ctx, canvas, world, camera } = this;
    
    const timeOfDay = (world.time % world.dayLength) / world.dayLength;
    const sunPhase = (timeOfDay - 0.25 + 1) % 1;
    const sunVisible = sunPhase >= 0 && sunPhase <= 0.5;
    
    let r, g, b;
    
    if (timeOfDay < 0.15 || timeOfDay > 0.85) {
      r = NIGHT_SKY[0]; g = NIGHT_SKY[1]; b = NIGHT_SKY[2];
    } else if (timeOfDay < 0.25) {
      const t = (timeOfDay - 0.15) / 0.1;
      r = Math.floor(NIGHT_SKY[0] * (1 - t) + 100 * t);
      g = Math.floor(NIGHT_SKY[1] * (1 - t) + 70 * t);
      b = Math.floor(NIGHT_SKY[2] * (1 - t) + 140 * t);
    } else if (timeOfDay < 0.35) {
      const t = (timeOfDay - 0.25) / 0.1;
      r = Math.floor(100 * (1 - t) + 135 * t);
      g = Math.floor(70 * (1 - t) + 200 * t);
      b = Math.floor(140 * (1 - t) + 255 * t);
    } else if (timeOfDay < 0.65) {
      r = 135; g = 200; b = 255;
    } else if (timeOfDay < 0.75) {
      const t = (timeOfDay - 0.65) / 0.1;
      r = Math.floor(135 * (1 - t) + 100 * t);
      g = Math.floor(200 * (1 - t) + 70 * t);
      b = Math.floor(255 * (1 - t) + 140 * t);
    } else {
      const t = (timeOfDay - 0.75) / 0.1;
      r = Math.floor(100 * (1 - t) + NIGHT_SKY[0] * t);
      g = Math.floor(70 * (1 - t) + NIGHT_SKY[1] * t);
      b = Math.floor(140 * (1 - t) + NIGHT_SKY[2] * t);
    }
    
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!sunVisible) {
      this.drawStars();
    }
  }
  
drawStars() {
  const { ctx, canvas, world, camera } = this;
  const time = world.time;
  
  ctx.save();
  for (const star of world.stars) {
    const parallaxFactor = 0.1;
    let starX = (star.x - camera.x * parallaxFactor) % canvas.width;
    if (starX < 0) starX += canvas.width;
    let starY = (star.y - camera.y * parallaxFactor) % canvas.height;
    if (starY < 0) starY += canvas.height;
    
    const twinkle = Math.sin(time * star.speed + star.phase) * 0.3 + 0.7;
    const opacity = star.opacity * twinkle;
    
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.fillRect(starX - star.size / 2, starY - star.size / 2, star.size, star.size);
  }
  ctx.restore();
}

   drawItems() {
     const items = this.world.items || [];
     
     if (!items || items.length === 0) {
       return;
     }

     const ctx = this.ctx;
     const camera = this.camera;
     
     for (const item of items) {
       const sx = Math.round(camera.worldToScreenX(item.x));
       const sy = Math.round(camera.worldToScreenY(item.y));
       
       const size = Math.max(10, Math.round(10 * camera.zoom));
       
       const tileX = Math.floor(item.x / 16);
       const tileY = Math.floor(item.y / 16);
       const combinedLightFactor = this.lightFactorAt(tileX, tileY, false);
       
       const itemId = item.blockId || item.itemId;
       const texture = this.biomeTexture(itemId, this.textures[itemId], tileX);
       
       if (texture) {
         this.drawBlockTexture(texture, sx - size/2, sy - size/2, size, combinedLightFactor);
       } else {
         const blockType = this.registry.get(itemId);
         const color = blockType?.color || '#ff0000';
         
         const lightIntensity = Math.max(0.2, combinedLightFactor);
         
         ctx.fillStyle = color;
         const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
         if (rgb) {
           const r = Math.min(255, parseInt(rgb[1], 16) * lightIntensity);
           const g = Math.min(255, parseInt(rgb[2], 16) * lightIntensity);
           const b = Math.min(255, parseInt(rgb[3], 16) * lightIntensity);
           ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
         }
         
         ctx.fillRect(sx - size/2, sy - size/2, size, size);
         
         ctx.strokeStyle = '#000000';
         ctx.lineWidth = 1;
         ctx.strokeRect(sx - size/2, sy - size/2, size, size);
       }
     }
   }

  drawLeafParticles() {
    const ui = this.getUI();
     const leafParticles = ui && ui.leafParticles ? ui.leafParticles : null;
    if (!leafParticles || leafParticles.length === 0) return;

    const { ctx, camera, world } = this;
    ctx.imageSmoothingEnabled = false;

    for (const particle of leafParticles) {
      const sx = Math.round(camera.worldToScreenX(particle.x));
      const sy = Math.round(camera.worldToScreenY(particle.y));
      const size = Math.max(10, Math.round(TILE_SIZE * 0.8 * camera.zoom));

      const tileX = Math.floor(particle.x / TILE_SIZE);
      const tileY = Math.floor(particle.y / TILE_SIZE);
      const combinedLightFactor = this.lightFactorAt(tileX, tileY, false);
      
      let alpha = 1.0;
      if (particle.fadeOut) {
        alpha = 1.0 - particle.fadeProgress;
      }
      
      let texture = this.textures[`falling_leaf_${particle.blockId}`] || this.textures['falling_leaf'] || this.textures['oak_leaf_particle'] || null;
      if (texture && particle.blockId && biomeHasLeafTint(particle.blockId)) {
        texture = this.getBiomeTinted(`falling_leaf_${particle.blockId}`, texture, Math.floor(particle.x / TILE_SIZE), particle.blockId);
      }

      if (texture) {
        ctx.save();
        ctx.globalAlpha = alpha;
        
        const tintedLightFactor = combinedLightFactor * particle.tintFactor;
        
        this.drawBlockTexture(texture, sx - size / 2, sy - size / 2, size, tintedLightFactor, particle.rotation);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = alpha;
        let c = '#5a9e5a';
        if (particle.blockId === 'birch_leaves') {
          c = '#9ac89a';
        } else if (particle.blockId === 'spruce_leaves') {
          c = '#3a9a3a';
        } else if (particle.blockId === 'pine_leaves') {
          c = '#2e6e5a';
        } else if (particle.blockId === 'maple_green_leaves') {
          c = '#5acc5a';
        } else if (particle.blockId === 'maple_orange_leaves') {
          c = '#ffaa33';
        } else if (particle.blockId === 'maple_red_leaves') {
          c = '#ff5555';
        } else if (particle.blockId) {
          if (particle.blockId.includes('oak')) c = '#5a9e5a';
          if (particle.blockId.includes('birch')) c = '#9ac89a';
          if (particle.blockId.includes('spruce')) c = '#3a9a3a';
          if (particle.blockId.includes('maple')) c = '#ffaa33';
          if (particle.blockId.includes('pine')) c = '#2e6e5a';
        }
        
        const tintedLightFactor = Math.min(1.0, combinedLightFactor * particle.tintFactor);
        c = darkenHex(c, tintedLightFactor);
        
        ctx.fillStyle = c;
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
        
        ctx.strokeStyle = darkenHex(c, 0.7);
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - size / 2, sy - size / 2, size, size);
        
        ctx.restore();
      }
    }
  }

  // Leaf blocks grow a ragged edge of leaf pixels into any air beside them.
  drawLeafFringes(startX, endX, startY, endY) {
    const { world, camera } = this;
    const size = Math.round(TILE_SIZE * camera.zoom);
    for (let x = startX; x <= endX; x++) {
      if (!world.isChunkLoaded(world.chunkXFor(x))) continue;
      for (let y = startY; y <= endY; y++) {
        const id = world.getCell(x, y).id;
        if (!id.endsWith('_leaves')) continue;
        let texture = this.textures[id];
        if (!texture) continue;
        if (biomeHasLeafTint(id)) texture = this.getBiomeTinted(id, texture, x);
        for (const [side, dx, dy] of LEAF_FRINGE_SIDES) {
          const nx = x + dx, ny = y + dy;
          if (!world.inBounds(nx, ny) || world.getCell(nx, ny).id !== 'air') continue;
          const fringe = this.getLeafFringe(id, texture, side, (x * 7 + y * 13) & 3);
          if (!fringe) continue;
          const sx = Math.round(camera.worldToScreenX(nx * TILE_SIZE));
          const sy = Math.round(camera.worldToScreenY(ny * TILE_SIZE));
          const light = this.isOpenSky(nx, ny) ? this.lightFactorAt(nx, ny, true) : 1.0;
          this.drawBlockTexture(fringe, sx, sy, size, light);
        }
      }
    }
  }

  // Draws a rock/pebble scaled by meta.size, slid sideways by meta.offset, mirrored by meta.flip, resting on the block's floor.
  drawRock(texture, sx, sy, size, meta, lightFactor) {
    const box = this.getOpaqueBounds(texture);
    if (!box) return;
    const quant = Math.max(MIN_BRIGHTNESS, Math.min(1, Math.round(lightFactor * 50) / 50));
    const image = quant >= 1 ? texture : this.getTintedTexture(texture, quant);
    const px = size / 16;
    const scale = ROCK_SCALES[meta?.size ?? 1] ?? 1;
    const dw = Math.round(box.w * scale * px);
    const dh = Math.round(box.h * scale * px);
    const offset = meta?.offset ?? 0.5;
    const dx = Math.round(sx + (size - dw) * offset);
    const dy = sy + size - dh;
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    if (meta?.flip) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(image, box.x, box.y, box.w, box.h, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(image, box.x, box.y, box.w, box.h, dx, dy, dw, dh);
    }
  }

  getOpaqueBounds(texture) {
    const key = `bounds|${texture.src}`;
    if (this._imageCache.has(key)) return this._imageCache.get(key);
    if (!texture.complete || !texture.width) return null;
    const c = document.createElement('canvas');
    c.width = texture.width; c.height = texture.height;
    const cctx = c.getContext('2d');
    cctx.drawImage(texture, 0, 0);
    const d = cctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] === 0) continue;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    const box = x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    this._imageCache.set(key, box);
    return box;
  }

  // The texture for `id` recoloured for the biome at tileX (unchanged if it isn't biome-tinted).
  biomeTexture(id, texture, tileX) {
    if (!texture || !(BIOME_TINTED.has(id) || biomeHasLeafTint(id))) return texture;
    return this.getBiomeTinted(id, texture, tileX);
  }

  // Image URL for inventory/hotbar icons, tinted for the player's current biome.
  biomeIconSrc(id) {
    const texture = this.textures[id];
    if (!texture || !this.world || !this.player) return null;
    const tinted = this.biomeTexture(id, texture, Math.floor((this.player.x + this.player.width / 2) / TILE_SIZE));
    if (tinted === texture) return null;
    if (!tinted.dataURL) tinted.dataURL = tinted.toDataURL();
    return tinted.dataURL;
  }

  // Average colour of a texture's green pixels: the colour biome tints are relative to.
  getGreenAverage(id, texture) {
    const key = `greenavg|${id}`;
    let avg = this._imageCache.get(key);
    if (avg) return avg;
    const c = document.createElement('canvas');
    c.width = texture.width; c.height = texture.height;
    const cctx = c.getContext('2d');
    cctx.drawImage(texture, 0, 0);
    const d = cctx.getImageData(0, 0, c.width, c.height).data;
    const sum = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (!isGreenPixel(d, i)) continue;
      sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; n++;
    }
    avg = n ? sum.map(v => Math.round(v / n)) : [128, 128, 128];
    this._imageCache.set(key, avg);
    return avg;
  }

  // colorId picks whose biome colour to use (e.g. a falling-leaf texture follows its leaf block).
  getBiomeTinted(id, texture, tileX, colorId = id) {
    if (!texture.complete || !texture.width) return texture;
    const seed = this.world.seed ?? 0;
    const base = this.getGreenAverage(id, texture);
    const [r, g, b] = colorId.endsWith('_leaves') ? leafColorAt(tileX, seed, colorId, base) : grassColorAt(tileX, seed);
    if (r === base[0] && g === base[1] && b === base[2]) return texture;
    const key = `biome|${id}|${r},${g},${b}`;
    let tinted = this._imageCache.get(key);
    if (tinted) return tinted;

    tinted = document.createElement('canvas');
    tinted.width = texture.width;
    tinted.height = texture.height;
    tinted.src = key;
    const tctx = tinted.getContext('2d');
    tctx.drawImage(texture, 0, 0);
    const img = tctx.getImageData(0, 0, tinted.width, tinted.height);
    const d = img.data;
    const scale = [r / base[0], g / base[1], b / base[2]];
    for (let i = 0; i < d.length; i += 4) {
      // Only recolour green pixels so the dirt on grass blocks and flower petals stay put.
      if (!isGreenPixel(d, i)) continue;
      for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, Math.round(d[i + c] * scale[c]));
    }
    tctx.putImageData(img, 0, 0);
    this._imageCache.set(key, tinted);
    return tinted;
  }

  getLeafFringe(id, texture, side, variant) {
    const key = `fringe|${texture.src}|${side}|${variant}`;
    let fringe = this._imageCache.get(key);
    if (fringe) return fringe;
    if (!texture.complete || !texture.width) return null;

    const src = document.createElement('canvas');
    src.width = 16; src.height = 16;
    const sctx = src.getContext('2d');
    sctx.drawImage(texture, 0, 0, 16, 16);
    const pixels = sctx.getImageData(0, 0, 16, 16).data;

    fringe = document.createElement('canvas');
    fringe.width = 16; fringe.height = 16;
    fringe.src = key;
    const fctx = fringe.getContext('2d');
    const out = fctx.createImageData(16, 16);

    let seed = (id.length * 31 + side.length * 17 + variant * 101) >>> 0;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return (seed >>> 16) / 65536;
    };
    let depth = 0;
    for (let i = 0; i < 16; i++) {
      // Random walk keeps the edge clumpy rather than noisy.
      depth = Math.max(0, Math.min(LEAF_FRINGE_DEPTH, depth + Math.round(rand() * 2 - 1)));
      if (rand() < 0.2) depth = 0;
      for (let d = 0; d < depth; d++) {
        // (fx, fy) is the fringe pixel in the neighbour tile; (tx, ty) the leaf texel it copies.
        let fx, fy, tx, ty;
        if (side === 'top') { fx = i; fy = 15 - d; tx = i; ty = d; }
        else if (side === 'bottom') { fx = i; fy = d; tx = i; ty = 15 - d; }
        else if (side === 'left') { fx = 15 - d; fy = i; tx = d; ty = i; }
        else { fx = d; fy = i; tx = 15 - d; ty = i; }
        const si = (ty * 16 + tx) * 4, oi = (fy * 16 + fx) * 4;
        if (pixels[si + 3] === 0) continue;
        out.data[oi] = pixels[si];
        out.data[oi + 1] = pixels[si + 1];
        out.data[oi + 2] = pixels[si + 2];
        out.data[oi + 3] = 255;
      }
    }
    fctx.putImageData(out, 0, 0);
    this._imageCache.set(key, fringe);
    return fringe;
  }

  getTintedTexture(texture, quant) {
    const cacheKey = `${texture.src}|${quant}`;
    let tinted = this._imageCache.get(cacheKey);
    if (!tinted) {
      tinted = document.createElement('canvas');
      tinted.width = texture.width || 16;
      tinted.height = texture.height || 16;
      const tctx = tinted.getContext('2d');
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(texture, 0, 0, tinted.width, tinted.height);
      tctx.globalCompositeOperation = 'source-atop';
      tctx.fillStyle = `rgba(0, 0, 0, ${1 - quant})`;
      tctx.fillRect(0, 0, tinted.width, tinted.height);
      this._imageCache.set(cacheKey, tinted);
    }
    return tinted;
  }

  drawBlockTexture(texture, x, y, size, lightFactor = 1.0, rotation = 0) {
    const { ctx } = this;
    const quant = Math.max(MIN_BRIGHTNESS, Math.min(1, Math.round(lightFactor * 50) / 50));
    const image = quant >= 1 ? texture : this.getTintedTexture(texture, quant);
    ctx.imageSmoothingEnabled = false;
    if (rotation !== 0) {
      ctx.save();
      ctx.translate(x + size / 2, y + size / 2);
      ctx.rotate(rotation);
      ctx.drawImage(image, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(image, x, y, size, size);
    }
  }

  drawPrimedExplosives(primed) {
    if (!primed || primed.length === 0) return;
    const { ctx, camera } = this;
    const texture = this.textures['explosive'];
    for (const p of primed) {
      const t = p.progress();
      const grow = 1 + t * t * 0.1;
      const size = Math.round(TILE_SIZE * camera.zoom * grow);
      const cx = camera.worldToScreenX(p.x + TILE_SIZE / 2);
      const cy = camera.worldToScreenY(p.y + TILE_SIZE / 2);
      const left = Math.round(cx - size / 2);
      const top = Math.round(cy - size / 2);
      const light = this.lightFactorAt(Math.floor((p.x + TILE_SIZE / 2) / TILE_SIZE), Math.floor((p.y + TILE_SIZE / 2) / TILE_SIZE), false);
      if (texture) {
        this.drawBlockTexture(texture, left, top, size, light);
      } else {
        ctx.fillStyle = '#b07d4e';
        ctx.fillRect(left, top, size, size);
      }
      ctx.save();
      ctx.globalAlpha = t * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(left, top, size, size);
      ctx.restore();
    }
  }

  missingTextureFor(type) {
    if (!this.missingTextures.has(type.id) || type.id === 'water' || type.opacity === 0) return null;
    if (type.shape !== 'full') return null;
    return this.textures['no_texture'] || null;
  }

  drawBlock(tileX, tileY, type, meta) {
    const { ctx, camera, world } = this;
    ctx.imageSmoothingEnabled = false;
    const sx = Math.round(camera.worldToScreenX(tileX * TILE_SIZE));
    const sy = Math.round(camera.worldToScreenY(tileY * TILE_SIZE));
    const size = Math.round(TILE_SIZE * camera.zoom);
    
    const isLightSource = type.lightLevel > 0;
    const finalLightFactor = !isLightSource && this.isOpenSky(tileX, tileY)
      ? this.lightFactorAt(tileX, tileY, true)
      : 1.0;

    // Bushes come in sizes (meta.size 1-4), each with its own texture.
    const textureId = type.id === 'bush' ? `bush_${meta?.size ?? 4}` : type.id;
    let texture = this.textures[textureId] || this.textures[type.id] || this.missingTextureFor(type);
    texture = this.biomeTexture(textureId, texture, tileX);
    if ((type.id === 'rock' || type.id === 'pebble') && texture) {
      this.drawRock(texture, sx, sy, size, meta, finalLightFactor);
      return;
    }
    if (meta?.axis === 'x' && texture) {
      // Fallen logs lie on their side: turn the bark texture a quarter turn.
      ctx.save();
      ctx.translate(sx + size / 2, sy + size / 2);
      ctx.rotate(Math.PI / 2);
      this.drawBlockTexture(texture, -size / 2, -size / 2, size, finalLightFactor);
      ctx.restore();
      return;
    }
    if (type.shape === 'torch' && texture && (meta?.wall === 'left' || meta?.wall === 'right')) {
      const dir = meta.wall === 'left' ? 1 : -1;
      ctx.save();
      const pivotX = dir === 1 ? sx + size * (8 / 16 - 7 / 16) : sx + size - size * (10 / 16 - 8 / 16);
      ctx.translate(pivotX, sy + size * 0.85);
      ctx.rotate(dir * WALL_TORCH_ANGLE);
      ctx.drawImage(texture, -size * 8 / 16, -size, size, size);
      ctx.restore();
      return;
    }
    
    if (type.id === 'ladder' && texture) {
      if (meta?.wall === 'right') {
        ctx.save();
        ctx.translate(sx + size, sy);
        ctx.scale(-1, 1);
        this.drawBlockTexture(texture, 0, 0, size, finalLightFactor);
        ctx.restore();
      } else {
        this.drawBlockTexture(texture, sx, sy, size, finalLightFactor);
      }
      return;
    }

    let chestTexture = null;
    if (type.id.endsWith('_chest') && (meta?.chestType === 'left' || meta?.chestType === 'right')) {
      chestTexture = this.textures[`${type.id}_${meta.chestType}`];
    }

    if (texture || chestTexture) {
      const drawTexture = chestTexture || texture;
      const flip = type.shape === 'stairs' && meta?.orient === 'left';
      const shiftUp = type.shape === 'slab' && meta?.slabPos === 'top' ? Math.floor(size / 2) : 0;
      const isBg = meta?.layer === 'bg';

      ctx.save();
      if (isBg) ctx.globalAlpha = 0.7;
      ctx.translate(flip ? sx + size : sx, sy - shiftUp);
      if (flip) ctx.scale(-1, 1);
      this.drawBlockTexture(drawTexture, 0, 0, size, isBg ? finalLightFactor * 0.6 : finalLightFactor);
      ctx.restore();
      return;
    }

    const isBackground = meta?.layer === 'bg' && !isLightSource;
    const c = darkenHex(type.color || '#999999', isBackground ? finalLightFactor * 0.6 : finalLightFactor);

    ctx.save();
    ctx.translate(sx, sy);
    if (isBackground) ctx.globalAlpha = 0.7;

    if (type.id === 'water') {
      ctx.fillStyle = c + '80';
      ctx.fillRect(0, 0, size, size);
    } else if (type.shape === 'full') {
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#00000020';
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    } else if (type.shape === 'slab') {
      const pos = meta?.slabPos ?? 'bottom';
      ctx.fillStyle = c;
      if (pos === 'bottom') {
        ctx.fillRect(0, Math.floor(size / 2), size, Math.floor(size / 2));
      } else {
        ctx.fillRect(0, 0, size, Math.floor(size / 2));
      }
      ctx.strokeStyle = '#00000020';
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    } else if (type.shape === 'stairs') {
      const orient = meta?.orient ?? 'right';
      ctx.fillStyle = c;
      ctx.beginPath();
      if (orient === 'right') {
        ctx.moveTo(0, size);
        ctx.lineTo(size, size);
        ctx.lineTo(size, 0);
      } else {
        ctx.moveTo(0, 0);
        ctx.lineTo(0, size);
        ctx.lineTo(size, size);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#00000020';
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    } else if (type.shape === 'torch') {
      const torchBrightness = 1.0;
      
      const flameColor = '#ff6b35';
      ctx.fillStyle = flameColor;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 4, 0, Math.PI * 2);
      ctx.fill();
      
      const handleColor = '#8b4513';
      ctx.fillStyle = handleColor;
      ctx.fillRect(size / 2 - 2, size / 2 + size / 4, 4, size / 3);
      
      ctx.save();
      ctx.globalAlpha = 0.3;
      const glowColor = '#ffaa00';
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  drawPlayer() {
    const { ctx, camera, player, world } = this;
    const centerX = Math.round(camera.worldToScreenX(player.x + player.width / 2));
    
    const playerTileX = Math.floor((player.x + player.width / 2) / TILE_SIZE);
    const playerTileY = Math.floor((player.y + player.height / 2) / TILE_SIZE);
    
    const combinedLightFactor = this.lightFactorAt(playerTileX, playerTileY, false);
    ctx.save();
    if (combinedLightFactor < 1) ctx.filter = `brightness(${combinedLightFactor.toFixed(2)})`;
    
    const steveSkin = this.textures['steve'];
    
    const headSize = 8;
    const torsoWidth = 4;
    const torsoHeight = 12;
    const armWidth = 4;
    const armHeight = 12;
    const legWidth = 4;
    const legHeight = 12;
    
    const scale = 3;
    const scaledHead = headSize * scale;
    const scaledTorsoWidth = torsoWidth * scale;
    const scaledTorsoHeight = torsoHeight * scale;
    const scaledArmWidth = armWidth * scale;
    const scaledArmHeight = armHeight * scale;
    const scaledLegWidth = legWidth * scale;
    const scaledLegHeight = legHeight * scale;
    
    const centerY = Math.round(camera.worldToScreenY(player.y + player.height));
    
    const torsoX = centerX - scaledTorsoWidth / 2;
    const crouchLean = player.crouching ? CROUCH_LEAN : 0;
    const hipShift = player.crouching ? scaledLegHeight * CROUCH_HIP_BACK : 0;
    const crouchSink = player.crouching ? scaledLegHeight * CROUCH_SINK : 0;
    const torsoBack = player.crouching ? scaledLegHeight * CROUCH_TORSO_BACK : 0;
    const torsoY = centerY - scaledLegHeight - scaledTorsoHeight;
    const hipX = centerX;
    const hipY = torsoY + scaledTorsoHeight;
    const lean = () => {
      if (!crouchLean) return;
      ctx.translate(hipX - hipShift - torsoBack, hipY + crouchSink);
      ctx.rotate(crouchLean);
      ctx.translate(-hipX, -hipY);
    };
    const headLean = () => {
      if (!crouchLean) return;
      ctx.translate(-hipShift - torsoBack + scaledTorsoHeight * Math.sin(crouchLean), crouchSink + scaledTorsoHeight * (1 - Math.cos(crouchLean)));
    };

    const headX = centerX - scaledHead / 2;
    const headY = torsoY - scaledHead;
    
    const input = this.input;
    let mouseWorldX = player.x + player.width / 2 + 100;
    let mouseWorldY = player.y + player.height / 2;
    let facingRight = true;
    
    if (input && input.mouse) {
      mouseWorldX = this.camera.screenToWorldX(input.mouse.x);
      mouseWorldY = this.camera.screenToWorldY(input.mouse.y);
      facingRight = mouseWorldX > (player.x + player.width / 2);
    }
    
    if (input && input.mouse) {
      const headCenterX = headX + scaledHead / 2;
      const headCenterY = headY + scaledHead / 2;
      const dx = input.mouse.x - headCenterX;
      const dy = input.mouse.y - headCenterY;
      
      const headAngle = Math.atan2(dy, dx);
      
      ctx.save();
      if (!facingRight) {
        ctx.scale(-1, 1);
        ctx.translate(-centerX * 2, 0);
      }
      headLean();
      ctx.translate(headCenterX, headY + scaledHead);
      ctx.rotate(facingRight ? headAngle : Math.PI - headAngle);
      drawSkinPart(0, 8, headSize, headSize, -scaledHead/2, -scaledHead, scaledHead, scaledHead);
      ctx.restore();
    } else {
      ctx.save();
      if (!facingRight) {
        ctx.scale(-1, 1);
        ctx.translate(-centerX * 2, 0);
      }
      headLean();
      drawSkinPart(0, 8, headSize, headSize, headX, headY, scaledHead, scaledHead);
      ctx.restore();
    }
    
     const walkSpeed = 1.2;
     let effectiveSpeedFactor = player.walkingSpeedFactor;
     if (player.creativeFlying) {
       effectiveSpeedFactor = Math.min(0.8, player.walkingSpeedFactor);
     }
     const armSwing = Math.sin(player.walkCycle) * walkSpeed * effectiveSpeedFactor;
     const legSwing = Math.sin(player.walkCycle + Math.PI) * walkSpeed * effectiveSpeedFactor;
    
    function drawSkinPart(sx, sy, sw, sh, dx, dy, dw, dh) {
      if (steveSkin) {
        ctx.drawImage(steveSkin, sx, sy, sw, sh, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = 'rgb(200, 200, 200)';
        ctx.fillRect(dx, dy, dw, dh);
      }
    }

    ctx.save();
    if (!facingRight) {
      ctx.scale(-1, 1);
      ctx.translate(-centerX * 2, 0);
    }
    
    ctx.save();
    lean();
    ctx.translate(torsoX + scaledTorsoWidth/2, torsoY);
    ctx.rotate(-armSwing);
    drawSkinPart(40, 20, armWidth, armHeight, -scaledArmWidth/2, 0, scaledArmWidth, scaledArmHeight);
    ctx.restore();
    
    ctx.save();
    ctx.translate(hipX - hipShift, hipY);
    ctx.rotate(-legSwing);
    drawSkinPart(4, 20, legWidth, legHeight, -scaledLegWidth/2, 0, scaledLegWidth, scaledLegHeight);
    ctx.restore();
    
    ctx.save();
    ctx.translate(hipX - hipShift, hipY);
    ctx.rotate(legSwing);
    drawSkinPart(8, 20, legWidth, legHeight, -scaledLegWidth/2, 0, scaledLegWidth, scaledLegHeight);
    ctx.restore();
    
    ctx.save();
    lean();
    drawSkinPart(32, 20, torsoWidth, torsoHeight, torsoX, torsoY, scaledTorsoWidth, scaledTorsoHeight);
    ctx.restore();

    let rightArmAngle = armSwing;
    if (this.getHeldSlot()) {
      const lookDx = (input.mouse.x - centerX) * (facingRight ? 1 : -1);
      const lookDy = input.mouse.y - (torsoY + scaledTorsoHeight * 0.15);
      const aim = Math.atan2(lookDy, lookDx) - Math.PI / 2;
      rightArmAngle = HELD_ARM_ANGLE + (aim - HELD_ARM_ANGLE) * HELD_ARM_LOOK + armSwing * HELD_ARM_WALK;
    }
    
    const mining = this.breaker?.state?.active || (input.mouse.leftDown && !this.getUI?.()?.inventoryOpen);
    if (player.swingingArm > 0 || mining) {
      const shoulderScreenX = centerX;
      const shoulderScreenY = torsoY + scaledTorsoHeight * 0.15;
      const dx = input.mouse.x - shoulderScreenX;
      const dy = input.mouse.y - shoulderScreenY;
      const armAngle = Math.atan2(dy, dx) - Math.PI / 2 + Math.PI / 6;
      let swingMovement = 0;
      if (mining) {
        swingMovement = Math.sin(performance.now() * MINE_BOB_SPEED) * MINE_BOB_AMOUNT;
      }
      
      if (facingRight) {
        rightArmAngle = armAngle + swingMovement;
      } else {
        const flippedDx = -dx;
        const flippedArmAngle = Math.atan2(dy, flippedDx) - Math.PI / 2 + Math.PI / 6;
        rightArmAngle = flippedArmAngle + swingMovement;
      }
    }
    
    const action = player.armAction && ARM_ACTIONS[player.armAction.type];
    if (action) {
      const t = (performance.now() - player.armAction.start) / action.duration;
      if (t >= 1) player.armAction = null;
      else rightArmAngle += action.curve(t);
    }

    const armPivotX = torsoX + scaledTorsoWidth/2;
    const armPivotY = torsoY + scaledTorsoHeight * 0.15;
    const armTopOffset = -scaledTorsoHeight * 0.15;
    ctx.save();
    lean();
    ctx.translate(armPivotX, armPivotY);
    ctx.rotate(rightArmAngle);
    drawSkinPart(44, 20, armWidth, armHeight, -scaledArmWidth/2, armTopOffset, scaledArmWidth, scaledArmHeight);
    ctx.restore();

    ctx.save();
    lean();
    this.drawHeldItem({
      pivotX: armPivotX,
      pivotY: armPivotY,
      angle: rightArmAngle,
      armTopOffset,
      armLength: scaledArmHeight
    });
    ctx.restore();

    ctx.restore();
    ctx.restore();
  }

drawHeldItem(pose = null) {
      const { ctx, camera, player, inventory, input } = this;
      const ui = this.getUI?.() ?? {};
      const selectedIndex = Number.isInteger(ui.selectedIndex) ? ui.selectedIndex : 0;
      
      let currentInventory = inventory;
      if (!currentInventory && typeof window !== 'undefined' && window.inventory) {
        currentInventory = window.inventory;
      }
      
      if (!currentInventory) {
        return;
      }
      
      this.inventory = currentInventory;
      
      if (typeof currentInventory.getSlot !== 'function') {
        return;
      }
      
      const mouseWorldX = camera.screenToWorldX(input.mouse.x);
      const mouseWorldY = camera.screenToWorldY(input.mouse.y);
      player.updateMousePosition(mouseWorldX, mouseWorldY);
      
      const selectedSlot = currentInventory.getSlot(selectedIndex);
      if (!selectedSlot) {
        return;
      }
     
     const playerCenterX = player.x + player.width / 2;
     const shoulderY = player.y + player.height * 0.3;
     const facingRight = mouseWorldX >= playerCenterX;
      const handX = playerCenterX + (facingRight ? 28 : -28);
      const handY = player.y + player.height * 0.48 + Math.sin(player.walkCycle || 0) * 2;
     const angle = pose?.angle ?? (facingRight ? 0 : Math.PI);
     
      let textureId = null;
      
      if (selectedSlot.type === 'block') {
        textureId = selectedSlot.blockId;
      } else if (selectedSlot.type === 'item') {
        textureId = selectedSlot.itemId;
      }
      
      const isTool = /(_(pickaxe|axe|shovel|sword|hoe)|^stick|^trowel)$/.test(textureId || '');
      const baseSize = Math.round(8 * camera.zoom);
      const itemSize = isTool ? Math.round(baseSize * 1.75) : baseSize;
      
      ctx.save();
      
      const combinedLightFactor = 1;
      ctx.globalAlpha = 1.0;
      
      if (textureId && this.textures[textureId]) {
        if (pose) {
          const handDist = pose.armTopOffset + pose.armLength - baseSize * 0.45 + 10;
          // Rotate with the arm; tools are gripped near the bottom of their handle.
          if (isTool) {
            const toolOffset = itemSize * (TOOL_GRIP_OFFSETS[textureId.split('_').pop()] ?? 0.3);
            ctx.translate(pose.pivotX, pose.pivotY);
            ctx.rotate(pose.angle);
            ctx.translate(0, handDist - 8);
            ctx.rotate(TOOL_GRIP_ANGLE);
            this.drawBlockTexture(this.biomeTexture(textureId, this.textures[textureId], Math.floor((player.x + player.width / 2) / TILE_SIZE)), Math.round(toolOffset - itemSize/2), Math.round(-toolOffset - itemSize/2), itemSize, combinedLightFactor);
          } else {
            const screenX = Math.round(pose.pivotX - handDist * Math.sin(pose.angle));
            const screenY = Math.round(pose.pivotY + handDist * Math.cos(pose.angle) - 8);
            this.drawBlockTexture(this.biomeTexture(textureId, this.textures[textureId], Math.floor((player.x + player.width / 2) / TILE_SIZE)), screenX - itemSize/2, screenY - itemSize/2, itemSize, combinedLightFactor);
          }
        } else {
          const screenX = Math.round(camera.worldToScreenX(handX));
          const screenY = Math.round(camera.worldToScreenY(handY));
          this.drawBlockTexture(this.biomeTexture(textureId, this.textures[textureId], Math.floor((player.x + player.width / 2) / TILE_SIZE)), screenX - itemSize/2, screenY - itemSize/2, itemSize, combinedLightFactor);
        }
      } else {
        const lightIntensity = Math.max(0.2, combinedLightFactor);
        if (pose) {
          const handDist = pose.armTopOffset + pose.armLength - itemSize * 0.45 + 10;
          const screenX = Math.round(pose.pivotX - handDist * Math.sin(pose.angle));
          const screenY = Math.round(pose.pivotY + handDist * Math.cos(pose.angle) - 8);
          const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec('#8B4513');
          if (rgb) {
            const r = Math.min(255, parseInt(rgb[1], 16) * lightIntensity);
            const g = Math.min(255, parseInt(rgb[2], 16) * lightIntensity);
            const b = Math.min(255, parseInt(rgb[3], 16) * lightIntensity);
            ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
          } else {
            ctx.fillStyle = '#8B4513';
          }
          ctx.fillRect(screenX - itemSize/2, screenY - itemSize/2, itemSize, itemSize);
        } else {
          const screenX = Math.round(camera.worldToScreenX(handX));
          const screenY = Math.round(camera.worldToScreenY(handY));
          const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec('#8B4513');
          if (rgb) {
            const r = Math.min(255, parseInt(rgb[1], 16) * lightIntensity);
            const g = Math.min(255, parseInt(rgb[2], 16) * lightIntensity);
            const b = Math.min(255, parseInt(rgb[3], 16) * lightIntensity);
            ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
          } else {
            ctx.fillStyle = '#8B4513';
          }
          ctx.fillRect(screenX - itemSize/2, screenY - itemSize/2, itemSize, itemSize);
        }
      }
     
     ctx.restore();
}

  drawBreakingProgress() {
    const state = this.breaker.getState();
    if (!state || !state.active) return;

    const { camera, ctx, world, registry } = this;
    const sx = Math.round(camera.worldToScreenX(state.x * TILE_SIZE));
    const sy = Math.round(camera.worldToScreenY(state.y * TILE_SIZE));
    const type = registry.get(world.getBlockId(state.x, state.y)) || registry.get(state.id);
    
    if (!type) return;
    
    const progress = Math.min(1, state.progress);
    const size = Math.round(TILE_SIZE * camera.zoom);
    
    ctx.save();
    
    const barHeight = 4;
    const barY = sy + size - barHeight - 2;
    const barWidth = size - 4;
    const progressWidth = barWidth * progress;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(sx + 2, barY, barWidth, barHeight);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx + 2, barY, progressWidth, barHeight);
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.strokeRect(sx, sy, size, size);
    
    ctx.restore();
  }

  drawHoveredBlockOutline() {
    const ui = this.getUI();
    const input = this.input;
    const camera = this.camera;
    const world = this.world;
    const ctx = this.ctx;
    const player = this.player;
    
    if (!ui.showOutline) return;
    
    const worldX = camera.screenToWorldX(input.mouse.x);
    const worldY = camera.screenToWorldY(input.mouse.y);
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);
    
    if (world.inBounds(tileX, tileY) && world.getBlockId(tileX, tileY) !== 'air') {
      const playerCenterX = player.x + player.width / 2;
      const playerCenterY = player.y + player.height / 2;
      const dx = (tileX * TILE_SIZE + TILE_SIZE / 2) - playerCenterX;
      const dy = (tileY * TILE_SIZE + TILE_SIZE / 2) - playerCenterY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= 5 * TILE_SIZE) {
        const sx = Math.round(camera.worldToScreenX(tileX * TILE_SIZE));
        const sy = Math.round(camera.worldToScreenY(tileY * TILE_SIZE));
        const size = Math.round(TILE_SIZE * camera.zoom);
        
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, size, size);
      }
    }
  }

  drawPositionOutlines() {
    const { camera, ctx } = this;
    const ui = this.getUI();
    
    const setPosition1 = ui?.setPosition1;
    const setPosition2 = ui?.setPosition2;
    
    const outlineColor1 = '#00ff00';
    const outlineColor2 = '#ff0000';
    const outlineWidth = 2;
    
    if (setPosition1) {
      const sx = Math.round(camera.worldToScreenX(setPosition1.x * TILE_SIZE));
      const sy = Math.round(camera.worldToScreenY(setPosition1.y * TILE_SIZE));
      const size = Math.round(TILE_SIZE * camera.zoom);
      
      ctx.save();
      ctx.strokeStyle = outlineColor1;
      ctx.lineWidth = outlineWidth;
      ctx.strokeRect(sx, sy, size, size);
      ctx.restore();
    }
    
    if (setPosition2) {
      const sx = Math.round(camera.worldToScreenX(setPosition2.x * TILE_SIZE));
      const sy = Math.round(camera.worldToScreenY(setPosition2.y * TILE_SIZE));
      const size = Math.round(TILE_SIZE * camera.zoom);
      
      ctx.save();
      ctx.strokeStyle = outlineColor2;
      ctx.lineWidth = outlineWidth;
      ctx.strokeRect(sx, sy, size, size);
      ctx.restore();
    }
  }
}
