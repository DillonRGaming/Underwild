import { TILE_SIZE, darkenHex } from './utils.js';
import { naturalHeightAt, naturalDirtDepthAt, lakeWaterTopAt, sampleBlockAt } from '../logic/terrainGen.js';
import { waterLevel, waterMass, WATER_LEVELS } from '../logic/water.js';
import { grassColorAt, leafColorAt, biomeHasLeafTint, fogAt, ROCK_SCALES } from '../logic/biomes.js';

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
// Plants that bend in the wind: the tip leans furthest, the base stays put.
const WIND_SWAY = new Set(['short_grass', 'grass_tuft', 'fern', 'flower_short_grass', 'poppy', 'bush']);
const WIND_MAX_BEND = 2.5;   // texels the tip of a plant bends in the strongest gust
const WIND_SPEED = 14;       // tiles per second a gust travels across the land
const WIND_STIFFNESS = { bush: 0.45 };
const TRUNK_MAX_BEND = 2.2;  // texels the top of a TRUNK_REF_HEIGHT-tall trunk bends in a gust
const TRUNK_REF_HEIGHT = 9;   // trunk height (blocks) that reaches the full bend
const LEAF_MAX_SWAY = 1.6;   // texels a leaf block shifts in the strongest gust
const FOG_SMOOTH = 5;          // columns either side averaged for the fog's ground line
const FOG_TEXELS_PER_TILE = 8; // mist texture texels per block column (texture is 256 wide)
const FALL_SLIDE_MS = 120;   // matches world.js FALL_TICK_INTERVAL
const LEAF_FRINGE_DEPTH = 2;

function isTrunk(id) {
  return id.endsWith('_log') || id === 'birch_log_base';
}

// Images report `complete` once loaded; canvases (tinted textures) have no such flag.
function isTextureReady(texture) {
  return !!texture && texture.width > 0 && texture.complete !== false;
}

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

    // Mist sits behind the land and trees, filling the open air between them.
    this.drawFog(startX, endX);

    this._splashes = [];
    this._waterFrame = (this._waterFrame || 0) + 1;
    for (let x = startX; x <= endX; x++) {
      if (!world.isChunkLoaded(world.chunkXFor(x))) continue;
      for (let y = startY; y <= endY; y++) {
        const cell = world.getCell(x, y);
        const t = this.registry.get(cell.id);
        if (!t) continue;
        if (!t.solid || cell.id === 'air') {
          // Lakes have a fixed sand backdrop where their water was generated; it stays put
          // whatever the water in front of it does.
          if (this.isLakeBackdrop(x, y)) this.drawBackgroundWall(x, y, ui?.textureQuality === 'fast', 'sand');
          else if (!this.isOpenSky(x, y)) this.drawBackgroundWall(x, y, ui?.textureQuality === 'fast');
          if (cell.id === 'air') continue;
        }
        // A block still sliding into its cell leaves the cell's bottom uncovered: fill it.
        if (cell.meta?.fellAt && performance.now() - cell.meta.fellAt < (cell.meta.slideMs || FALL_SLIDE_MS)) {
          if (this.isLakeBackdrop(x, y)) this.drawBackgroundWall(x, y, ui?.textureQuality === 'fast', 'sand');
          else if (y >= this.naturalSurfaceAt(x)) this.drawBackgroundWall(x, y, ui?.textureQuality === 'fast');
        }
        // Water flowing through a plant: solid water behind it (so the colour matches the
        // water around it), then a see-through layer in front so the plant sits in the water.
        const plantWater = cell.meta?.water > 0 && cell.id !== 'water';
        if (plantWater) this.drawBlock(x, y, this.registry.get('water'), { mass: cell.meta.water });
        this.drawBlock(x, y, t, cell.meta || {});
        if (plantWater) {
          ctx.save();
          ctx.globalAlpha = 0.55;
          this.drawBlock(x, y, this.registry.get('water'), { mass: cell.meta.water });
          ctx.restore();
        }
      }
    }

    // Foam and bubbles go on top of the water cells around them.
    this.drawSplashes();
    this.drawLeafFringes(startX, endX, startY, endY);

    this.drawLightOverlay(startX, endX, startY, endY);
    if (ui?.textureQuality !== 'fast') this.drawLightTint(startX, endX, startY, endY);
    this.drawBreakingProgress();
    // The player and dropped items are drawn on their own layer, so the water in front of
    // them can tint just their pixels (they look submerged) before it goes on screen.
    const layer = this.entityLayer();
    const mainCtx = this.ctx;
    this.ctx = layer.getContext('2d');
    this.ctx.setTransform(mainCtx.getTransform());
    this.drawPlayer();
    this.drawItems();
    const p = this.player;
    const rects = [[p.x - 8, p.y - 8, p.width + 16, p.height + 8]];
    for (const item of world.items || []) rects.push([item.x - 8, item.y - 8, 16, 16]);
    this.ctx.globalCompositeOperation = 'source-atop';
    this.drawWaterOver(rects);
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx = mainCtx;
    mainCtx.save();
    mainCtx.setTransform(1, 0, 0, 1, 0, 0);
    mainCtx.drawImage(layer, 0, 0);
    mainCtx.restore();
    this.drawLeafParticles();
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

  isLakeBackdrop(tileX, tileY) {
    const world = this.world;
    if (this._lakeWorld !== world) {
      this._lakeWorld = world;
      this._lakeCache = new Map();
    }
    let top = this._lakeCache.get(tileX);
    if (top === undefined) {
      top = lakeWaterTopAt(tileX, world.seed ?? 0, world.height, world.worldType);
      this._lakeCache.set(tileX, top);
    }
    return top !== null && tileY >= top && tileY < this.naturalSurfaceAt(tileX);
  }

  backgroundWallTexture(tileX, tileY) {
    const world = this.world;
    // Dug-out beaches keep a sand wall behind them rather than dirt.
    if (this._wallWorld !== world) {
      this._wallWorld = world;
      this._wallCache = new Map();
    }
    const key = tileX * 4096 + tileY;
    let generated = this._wallCache.get(key);
    if (generated === undefined) {
      generated = sampleBlockAt(tileX, tileY, world.seed ?? 0, world.height, world.width, world.worldType)?.id || '';
      if (this._wallCache.size > 50000) this._wallCache.clear();
      this._wallCache.set(key, generated);
    }
    if (generated === 'sand' || generated === 'wet_sand') return this.textures[generated] || this.textures.sand || null;
    const depth = tileY - this.naturalSurfaceAt(tileX);
    const dirtDepth = naturalDirtDepthAt(tileX, world.seed ?? 0, world.worldType);
    return this.textures[depth <= dirtDepth ? 'dirt' : 'stone'] || null;
  }

  // fill (0..1) draws only the bottom part of the wall, e.g. behind a partly filled water cell.
  drawBackgroundWall(tileX, tileY, flat = false, wallId = null, fill = 1) {
    const { ctx, camera } = this;
    const left = Math.round(camera.worldToScreenX(tileX * TILE_SIZE));
    const top = Math.round(camera.worldToScreenY(tileY * TILE_SIZE));
    const width = Math.round(camera.worldToScreenX((tileX + 1) * TILE_SIZE)) - left;
    const height = Math.round(camera.worldToScreenY((tileY + 1) * TILE_SIZE)) - top;
    const texture = flat ? null : (wallId && this.textures[wallId]) || this.backgroundWallTexture(tileX, tileY);
    if (texture) {
      ctx.imageSmoothingEnabled = false;
      const rows = Math.max(1, Math.round(16 * fill));
      const y0 = top + height - Math.round(height * rows / 16);
      ctx.drawImage(this.getTintedTexture(texture, BACKGROUND_WALL_SHADE), 0, 16 - rows, 16, rows, left, y0, width, top + height - y0);
    } else {
      ctx.fillStyle = BACKGROUND_WALL;
      const y0 = top + height - Math.round(height * fill);
      ctx.fillRect(left, y0, width, top + height - y0);
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
          const sx = Math.round(camera.worldToScreenX(nx * TILE_SIZE)) + this.leafSwayOffset(x, y, size);
          const sy = Math.round(camera.worldToScreenY(ny * TILE_SIZE));
          const light = this.isOpenSky(nx, ny) ? this.lightFactorAt(nx, ny, true) : 1.0;
          this.drawBlockTexture(fringe, sx, sy, size, light);
        }
      }
    }
  }

  // A tileable strip of soft, chunky-pixel mist: dense at the bottom, wispy on top.
  getFogTexture(layer) {
    const key = `fog|${layer}`;
    let tex = this._imageCache.get(key);
    if (tex) return tex;
    const W = 256, H = 64, CELL = 4;
    tex = document.createElement('canvas');
    tex.width = W; tex.height = H;
    const tctx = tex.getContext('2d');
    let seed = 1234 + layer * 977;
    const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) / 16777216;
    const cols = W / CELL, rows = H / CELL;
    // Wrapping 2D value noise stretched sideways, so the mist forms long horizontal wisps.
    const GX = 12, GY = 5;
    const lattice = Array.from({ length: GX * GY }, rand);
    const smooth = k => k * k * (3 - 2 * k);
    const noise = (u, v) => {
      const fx = u * GX, fy = v * (GY - 1);
      const ix = Math.floor(fx), iy = Math.min(GY - 2, Math.floor(fy));
      const kx = smooth(fx - ix), ky = smooth(fy - iy);
      const at = (i, j) => lattice[j * GX + (i % GX)];
      const top = at(ix, iy) * (1 - kx) + at(ix + 1, iy) * kx;
      const bot = at(ix, iy + 1) * (1 - kx) + at(ix + 1, iy + 1) * kx;
      return top * (1 - ky) + bot * ky;
    };
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        const u = cx / cols, v = cy / rows;
        // Denser towards the ground (bottom), breaking into wisps higher up.
        const a = Math.max(0, Math.min(1, (noise(u, v) * 0.9 + v * 0.9 - 0.6) * 2.2));
        if (a <= 0.02) continue;
        tctx.fillStyle = `rgba(255,255,255,${(a * 0.75).toFixed(3)})`;
        tctx.fillRect(cx * CELL, cy * CELL, CELL, CELL);
      }
    }
    this._imageCache.set(key, tex);
    return tex;
  }

  // Low mist that settles over the terrain in foggy biomes (Taiga), drawn behind the blocks. Drawn in vertical
  // slices so it follows the ground and fades in across biome edges.
  drawFog(startX, endX) {
    const { ctx, camera, world } = this;
    const seed = world.seed ?? 0;
    const t = performance.now() / 1000;
    const size = TILE_SIZE * camera.zoom;
    const dl = this.daylight || { base: 1, sunVisible: true, travelT: 0.5 };
    // Thickest around dawn and through the night, thinnest at midday.
    const timeFactor = dl.sunVisible ? 0.7 + 0.3 * Math.max(0, 1 - dl.travelT * 3) : 0.9;
    const shade = Math.round(150 + 90 * dl.base);
    let any = false;
    for (let x = startX; x <= endX && !any; x++) any = fogAt(x, seed) > 0.01;
    if (!any) return;

    // Fog follows a smoothed ground line so it flows over hills as one sheet instead of
    // stepping at every column.
    const heights = [];
    for (let x = startX - FOG_SMOOTH; x <= endX + FOG_SMOOTH; x++) heights.push(naturalHeightAt(x, seed, world.height, world.worldType));
    const smoothGround = [];
    for (let i = 0; i <= endX - startX; i++) {
      let sum = 0;
      for (let k = 0; k <= FOG_SMOOTH * 2; k++) sum += heights[i + k];
      smoothGround.push(sum / (FOG_SMOOTH * 2 + 1));
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const layers = [
      { speed: 2.0, parallax: 0.6, height: 3.5, alpha: 0.85 },
      { speed: 3.5, parallax: 0.8, height: 2.6, alpha: 0.9 },
      { speed: 6.0, parallax: 1.0, height: 1.8, alpha: 1.0 }
    ];
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const tex = this.getFogTexture(li);
      // Colour the white mist to suit the light (bright by day, dim blue-grey at night).
      const tinted = this.getTintedFog(tex, li, shade);
      for (let x = startX; x <= endX; x++) {
        const density = fogAt(x, seed) * timeFactor * L.alpha;
        if (density < 0.02) continue;
        // Sit on this column's real ground (the bottom hides behind the block), never above it.
        const ground = Math.max(smoothGround[x - startX], naturalHeightAt(x, seed, world.height, world.worldType));
        const sx = Math.round(camera.worldToScreenX(x * TILE_SIZE));
        const bandH = Math.round(L.height * size);
        const bandBottom = Math.round(camera.worldToScreenY((ground + 1) * TILE_SIZE));
        // Each column takes the next FOG_TEXELS_PER_TILE texels of the strip, so the mist is
        // continuous; layers drift at their own speed and slide slightly against the camera.
        const drift = t * L.speed + camera.x / TILE_SIZE * (1 - L.parallax) * FOG_TEXELS_PER_TILE;
        const srcX = (((x * FOG_TEXELS_PER_TILE + Math.floor(drift)) % tex.width) + tex.width) % tex.width;
        const nextSx = Math.round(camera.worldToScreenX((x + 1) * TILE_SIZE));
        ctx.globalAlpha = Math.min(1, density);
        ctx.drawImage(tinted, srcX, 0, FOG_TEXELS_PER_TILE, tex.height, sx, bandBottom - bandH, nextSx - sx, bandH);
      }
    }
    ctx.restore();
  }

  getTintedFog(tex, layer, shade) {
    const level = Math.round(shade / 10) * 10;
    const key = `fogtint|${layer}|${level}`;
    let c = this._imageCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = tex.width; c.height = tex.height;
    const cctx = c.getContext('2d');
    cctx.drawImage(tex, 0, 0);
    cctx.globalCompositeOperation = 'source-in';
    cctx.fillStyle = `rgb(${level - 10}, ${level}, ${Math.min(255, level + 12)})`;
    cctx.fillRect(0, 0, c.width, c.height);
    // Fade the mist out towards the top so it thins away instead of ending in a line.
    const fade = cctx.createLinearGradient(0, 0, 0, c.height);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.45, 'rgba(0,0,0,0.6)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    cctx.globalCompositeOperation = 'destination-in';
    cctx.fillStyle = fade;
    cctx.fillRect(0, 0, c.width, c.height);
    this._imageCache.set(key, c);
    return c;
  }

  // Water: the ripple texture drifts slowly sideways, and the top block of a body of
  // water gets a bright, gently waving surface line.
  drawWater(texture, tileX, tileY, sx, sy, size, lightFactor, level = WATER_LEVELS) {
    const quant = Math.max(MIN_BRIGHTNESS, Math.min(1, Math.round(lightFactor * 50) / 50));
    const image = quant >= 1 ? texture : this.getTintedTexture(texture, quant);
    const ctx = this.ctx;
    const t = performance.now() / 1000;
    const px = size / 16;
    const shift = Math.floor(((t * 1.5 + tileY * 3) % 16 + 16) % 16);
    ctx.imageSmoothingEnabled = false;
    // Water in mid-air (nothing but air or a thin trickle under it) is drawn as a stream
    // scrolling downward; where a stream lands it keeps its shape down to the water line.
    const world = this.world;
    const massAt = (x, y) => (world.inBounds(x, y) ? waterMass(world.getCell(x, y)) : 0);
    const solidAt = (x, y) => {
      if (!world.inBounds(x, y)) return true;
      const id = world.getBlockId(x, y);
      return id !== 'air' && id !== 'water';
    };
    // Mid-air: nothing but air or a trickle below, and fed from above or off a ledge beside
    // it. A loose scrap with nothing feeding it is just drawn as a thin layer.
    const inAir = (x, y) => {
      const m = massAt(x, y);
      if (m <= 0 || m >= 0.9 || solidAt(x, y + 1) || massAt(x, y + 1) >= 0.5) return false;
      return massAt(x, y - 1) > 0 || massAt(x - 1, y) > 0 || massAt(x + 1, y) > 0;
    };
    // A loose scrap of water dropping through the air: draw it as a drop, not a floating layer.
    if (level < WATER_LEVELS && !solidAt(tileX, tileY + 1) && massAt(tileX, tileY + 1) < 0.5 && !inAir(tileX, tileY)) {
      const m = massAt(tileX, tileY);
      const dw = Math.max(2, Math.round(2 + m * 6)), dh = Math.max(3, Math.round(4 + m * 10));
      const phase = (t * 3 + tileX * 0.37) % 1;
      const dy = Math.round(phase * (16 - dh));
      ctx.drawImage(image, 8 - (dw >> 1), 0, dw, dh, sx + Math.round((8 - dw / 2) * px), sy + Math.round(dy * px), Math.round(dw * px), Math.round(dh * px));
      return;
    }
    // A thin film left resting on full water (a scrap of the slight squeeze deep water is
    // under) is hidden, and the water under it is drawn as the surface.
    const film = (x, y) => {
      const mm = massAt(x, y);
      return mm > 0 && mm < 0.25 && massAt(x, y + 1) >= 0.9 && massAt(x, y - 1) <= 0;
    };
    if (film(tileX, tileY)) return;
    const falling = inAir(tileX, tileY);
    const landing = !falling && inAir(tileX, tileY - 1);
    if (!falling && !landing && massAt(tileX, tileY - 1) > 0 && !film(tileX, tileY - 1)) level = WATER_LEVELS; // under water: full
    if (falling || landing) {
      const isWater = (x, y) => massAt(x, y) > 0;
      // Pool water beside it: the stream is landing in a pool rather than on bare ground.
      const inPool = landing && [-1, 1].some(dx => isWater(tileX + dx, tileY) && !inAir(tileX + dx, tileY));
      // Width follows the flow feeding the stream, so it doesn't bulge where it lands.
      const flow = Math.round(Math.min(1, massAt(tileX, tileY - 1) || massAt(tileX, tileY)) * 16);
      const inset = Math.max(0, (16 - Math.min(16, 8 + Math.round(flow / 2))) >> 1);
      // Side-by-side streams merge into one sheet; water spilling off a ledge reaches back
      // to the ledge it pours from.
      const fedAbove = isWater(tileX, tileY - 1);
      const joins = dx => inAir(tileX + dx, tileY) || (!fedAbove && falling && isWater(tileX + dx, tileY));
      const wetL = joins(-1), wetR = joins(1);
      const srcX = wetL ? 0 : inset;
      const widthTx = (wetR ? 16 : 16 - inset) - srcX;
      const x0 = sx + Math.round(srcX * px);
      const wPx = Math.round((srcX + widthTx) * px) - Math.round(srcX * px);
      const surfaceY = inPool ? sy + Math.round((16 - Math.max(1, level)) * px) : sy + size;
      const scroll = (t * 24) % 16;
      ctx.save();
      ctx.beginPath();
      // Water pouring off a ledge (nothing above it) starts at the height of the water it
      // spills from, not at the top of the block.
      let topT = 0;
      if (!fedAbove) {
        topT = 16 - Math.max(1, level);
        for (const dx of [-1, 1]) {
          const nm = massAt(tileX + dx, tileY);
          if (nm > 0 && !inAir(tileX + dx, tileY)) topT = Math.min(topT, 16 - Math.max(1, Math.min(16, Math.round(nm * 16))));
        }
      }
      const streamTop = sy + Math.round(topT * px);
      ctx.rect(x0, streamTop, wPx, surfaceY - streamTop);
      ctx.clip();
      const off = Math.round(scroll * px);
      ctx.drawImage(image, srcX, 0, widthTx, 16, x0, sy + off - size, wPx, size);
      ctx.drawImage(image, srcX, 0, widthTx, 16, x0, sy + off, wPx, size);
      ctx.restore();
      // Foam where a stream that has fallen at least two blocks hits water.
      const hitsWater = inPool || massAt(tileX, tileY + 1) >= 0.5;
      if (landing && hitsWater && inAir(tileX, tileY - 2)) {
        const row = inPool ? tileY : tileY + 1;
        let l = 0, r = 0;
        while (l < 2 && isWater(tileX - l - 1, row) && !inAir(tileX - l - 1, row)) l++;
        while (r < 2 && isWater(tileX + r + 1, row) && !inAir(tileX + r + 1, row)) r++;
        this._splashes?.push({ tileX, cx: x0 + wPx / 2, surfaceY, half: wPx / 2, px, size, quant,
          minX: sx - l * size, maxX: sx + (r + 1) * size });
      }
      if (!inPool) return;
    }
    // The surface is smoothed between columns: each edge of a surface cell sits halfway
    // between this column's water height and its neighbour's, so a draining dip reads as
    // a smooth slope rather than block steps. Heights are in world texels (down = larger).
    // Heights ease toward the simulated amount over a few frames, so tiny back-and-forth
    // wobbles in the simulation never show as jitter.
    const shownAt = (x, y) => this.shownWaterMass(x, y, massAt(x, y));
    const underWater = massAt(tileX, tileY - 1) > 0 && !film(tileX, tileY - 1);
    const fill = underWater ? WATER_LEVELS : Math.max(1, Math.min(16, Math.round(Math.min(1, shownAt(tileX, tileY)) * 16)));
    const own = (tileY + 1) * 16 - fill;
    const isSurface = massAt(tileX, tileY - 1) <= 0 || film(tileX, tileY - 1);
    const surfaceAt = x => {
      if (solidAt(x, tileY)) return null; // a wall: keep the edge flat against it
      for (let r = tileY - 2; r <= tileY + 4; r++) {
        const mm = massAt(x, r);
        if (mm <= 0 || film(x, r)) continue;
        if (r === tileY - 2 && massAt(x, r - 1) > 0) return r * 16;
        return (r + 1) * 16 - Math.max(1, Math.min(16, Math.round(shownAt(x, r) * 16)));
      }
      return solidAt(x, tileY + 1) ? own : (tileY + 5) * 16;
    };
    const tops = new Array(16);
    let smooth = false;
    if (isSurface) {
      // Each column's height is blended with two columns either side (stopping at walls),
      // and the edges sit between neighbouring blended heights: a soft curve, not steps.
      const raw = new Map();
      const rawAt = x => {
        if (!raw.has(x)) raw.set(x, x === tileX ? own : surfaceAt(x));
        return raw.get(x);
      };
      const blended = x => {
        const c = rawAt(x);
        if (c === null) return null;
        let sum = c * 3, w = 3;
        for (const dir of [-1, 1]) {
          for (let d = 1; d <= 2; d++) {
            const v = rawAt(x + dir * d);
            if (v === null) break;
            sum += v * (3 - d);
            w += 3 - d;
          }
        }
        return sum / w;
      };
      const mid = blended(tileX);
      const bl = blended(tileX - 1), br = blended(tileX + 1);
      const edgeL = bl === null ? mid : (mid + bl) / 2;
      const edgeR = br === null ? mid : (mid + br) / 2;
      const ownSmooth = mid;
      for (let i = 0; i < 16; i++) {
        const u = (i + 0.5) / 16;
        const abs = u < 0.5 ? edgeL + (ownSmooth - edgeL) * (u / 0.5) : ownSmooth + (edgeR - ownSmooth) * ((u - 0.5) / 0.5);
        tops[i] = Math.max(0, Math.min(15, Math.round(abs - tileY * 16)));
        if (tops[i] !== 16 - fill) smooth = true;
      }
    }
    // Deeper water is darker: blocks of water above this cell set how dark its top is, and
    // it darkens smoothly toward its bottom.
    let depth = 0;
    while (depth < 10 && massAt(tileX, tileY - depth - 1) > 0) depth++;
    const depthAlpha = d => Math.min(0.6, d * 0.07);
    const grad = ctx.createLinearGradient(0, sy, 0, sy + size);
    grad.addColorStop(0, `rgba(4, 14, 40, ${depthAlpha(depth)})`);
    grad.addColorStop(1, `rgba(4, 14, 40, ${depthAlpha(depth + 1)})`);
    const shadeDepth = (x, y, w, hh) => {
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, hh);
    };
    const shade = Math.round(255 * quant);
    const surfaceLine = (i, topT) => {
      const wave = Math.sin(t * 2 + (tileX * 16 + i) * 0.45) > 0.55 ? 1 : 0;
      const y0 = sy + topT * px;
      ctx.fillStyle = `rgba(${Math.round(shade * 0.7)}, ${Math.round(shade * 0.88)}, ${shade}, 0.85)`;
      ctx.fillRect(Math.round(sx + i * px), Math.round(y0 + wave * px), Math.ceil(px), Math.ceil(px));
      ctx.fillStyle = `rgba(${Math.round(shade * 0.45)}, ${Math.round(shade * 0.7)}, ${shade}, 0.55)`;
      ctx.fillRect(Math.round(sx + i * px), Math.round(y0 + (wave + 1) * px), Math.ceil(px), Math.ceil(px));
    };
    if (smooth) {
      for (let i = 0; i < 16; i++) {
        const topT = tops[i];
        const x0 = Math.round(sx + i * px), x1 = Math.round(sx + (i + 1) * px);
        const y0 = sy + Math.round(topT * px);
        ctx.drawImage(image, (i + shift) % 16, topT, 1, 16 - topT, x0, y0, x1 - x0, sy + size - y0);
        shadeDepth(x0, y0, x1 - x0, sy + size - y0);
        surfaceLine(i, topT);
      }
      return;
    }
    // Drift: draw the texture split at `shift` texels so it wraps seamlessly.
    // A partly filled cell only shows its bottom `level` layers.
    const top = 16 - fill;
    const syTop = sy + Math.round(top * px);
    const h = sy + size - syTop;
    const w1 = 16 - shift;
    ctx.drawImage(image, shift, top, w1, fill, sx, syTop, Math.round(w1 * px), h);
    if (shift > 0) ctx.drawImage(image, 0, top, shift, fill, sx + Math.round(w1 * px), syTop, size - Math.round(w1 * px), h);
    shadeDepth(sx, syTop, size, h);
    if (isSurface) for (let i = 0; i < 16; i++) surfaceLine(i, top);
  }

  // A cleared offscreen canvas the size of the screen.
  entityLayer() {
    const { canvas } = this;
    let layer = this._entityLayer;
    if (!layer || layer.width !== canvas.width || layer.height !== canvas.height) {
      layer = this._entityLayer = document.createElement('canvas');
      layer.width = canvas.width;
      layer.height = canvas.height;
    }
    const lctx = layer.getContext('2d');
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, layer.width, layer.height);
    lctx.imageSmoothingEnabled = false;
    return layer;
  }

  // Tints the parts of the given world rects [x, y, w, h] that are below the water line.
  drawWaterOver(rects) {
    const { ctx, camera, world } = this;
    for (const [rx, ry, rw, rh] of rects) {
      for (let ty = Math.floor(ry / TILE_SIZE); ty <= Math.floor((ry + rh) / TILE_SIZE); ty++) {
        for (let tx = Math.floor(rx / TILE_SIZE); tx <= Math.floor((rx + rw) / TILE_SIZE); tx++) {
          if (!world.inBounds(tx, ty)) continue;
          const m = waterMass(world.getCell(tx, ty));
          if (m <= 0) continue;
          const wetAbove = world.inBounds(tx, ty - 1) && waterMass(world.getCell(tx, ty - 1)) > 0;
          const top = wetAbove ? ty * TILE_SIZE : (ty + 1) * TILE_SIZE - Math.min(1, this.shownWaterMass(tx, ty, m)) * TILE_SIZE;
          const x0 = Math.max(rx, tx * TILE_SIZE), x1 = Math.min(rx + rw, (tx + 1) * TILE_SIZE);
          const y0 = Math.max(ry, top), y1 = Math.min(ry + rh, (ty + 1) * TILE_SIZE);
          if (x1 <= x0 || y1 <= y0) continue;
          const l = Math.max(MIN_BRIGHTNESS, this.lightFactorAt(tx, ty, false));
          ctx.fillStyle = `rgba(${Math.round(40 * l)}, ${Math.round(90 * l)}, ${Math.round(190 * l)}, 0.55)`;
          const sx0 = Math.round(camera.worldToScreenX(x0)), sx1 = Math.round(camera.worldToScreenX(x1));
          const sy0 = Math.round(camera.worldToScreenY(y0)), sy1 = Math.round(camera.worldToScreenY(y1));
          ctx.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
        }
      }
    }
  }

  // The water amount shown at (x, y): eases toward the simulated mass once per frame.
  shownWaterMass(x, y, actual) {
    if (!this._shownWater) this._shownWater = new Map();
    const key = x * 4096 + y;
    if (actual <= 0) { this._shownWater.delete(key); return 0; }
    let e = this._shownWater.get(key);
    if (!e) {
      // Water that has only just appeared (poured or flowed in) grows in from nothing
      // instead of popping in as a full block.
      const cell = this.world.getCell(x, y);
      const fresh = cell.meta?.newAt && Date.now() - cell.meta.newAt < 500;
      e = { v: fresh ? 0 : actual, f: this._waterFrame };
      this._shownWater.set(key, e);
      if (!fresh) return actual;
    }
    if (e.f !== this._waterFrame) {
      e.f = this._waterFrame;
      e.v += (actual - e.v) * 0.2;
      if (this._shownWater.size > 40000) this._shownWater.clear();
    }
    return e.v;
  }

  // Where a stream lands in water: churning foam on the surface, droplets thrown up and
  // bubbles rising back up through the pool beneath.
  drawSplashes() {
    const ctx = this.ctx;
    const t = performance.now() / 1000;
    const hash = n => (((n * 2654435761) >>> 0) % 1000) / 1000;
    for (const sp of this._splashes || []) {
      const { cx, surfaceY, half, px, size, quant, tileX, minX, maxX } = sp;
      const p = Math.max(1, Math.round(px));
      const light = Math.max(0.75, quant);
      const foamC = a => `rgba(${Math.round(235 * light)}, ${Math.round(245 * light)}, ${Math.round(255 * light)}, ${a.toFixed(2)})`;
      const dot = (x, y, a) => {
        if (x < minX || x + p > maxX || a <= 0.04) return;
        ctx.fillStyle = foamC(a);
        ctx.fillRect(Math.round(x), Math.round(y), p, p);
      };
      // Foam churning on the surface right around the stream, thinning out sideways.
      const spread = half + size * 0.6;
      const n = Math.ceil(spread / px);
      for (let i = -n; i <= n; i++) {
        const x = cx + i * px - p / 2;
        const d = Math.abs(i * px) / spread;
        const flick = Math.sin(t * 7 + i * 2.1 + tileX) * 0.5 + 0.5;
        dot(x, surfaceY - p, (1 - d * d) * (0.3 + 0.5 * flick));
        if (d < 0.5 && flick > 0.55) dot(x, surfaceY - 2 * p, 0.5 * (1 - d));
        if (d < 0.8) dot(x, surfaceY + (flick > 0.5 ? 0 : p), 0.35 * (1 - d));
      }
      // A few droplets kicked up next to the stream.
      for (let i = 0; i < 4; i++) {
        const ph = (t * 1.8 + hash(i + tileX * 13)) % 1;
        const side = i % 2 ? 1 : -1;
        const x = cx + side * (half + ph * size * (0.3 + 0.4 * hash(i * 7 + 3)));
        const y = surfaceY - p - Math.sin(ph * Math.PI) * size * (0.2 + 0.2 * hash(i + 11));
        dot(x, y, 0.75 * (1 - ph));
      }
      // Bubbles carried down by the stream, then rising back to the surface.
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.6 + hash(i * 5 + tileX)) % 1;
        const x = cx + (hash(i * 3 + 1) - 0.5) * (half * 2 + size * 0.5) + Math.sin(t * 4 + i * 2.3) * px;
        const y = surfaceY + p + (1 - ph) * size * 0.9;
        dot(x, y, 0.5 * Math.min(1, ph * 3) * (1 - ph * 0.4));
      }
    }
  }

  // Global wind strength (0..1) as felt at `t`: slow swells with occasional gusts on top.
  windStrength(t) {
    const swell = 0.5 + 0.5 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 1.3);
    const gust = Math.max(0, Math.sin(t * 0.9 + Math.sin(t * 0.31) * 2)) ** 3;
    return Math.min(1, 0.2 + swell * 0.45 + gust * 0.6);
  }

  // How far (in texels, at the plant's tip) the plant in column tileX is bent right now.
  // Gusts roll across the land at WIND_SPEED, plants lean with the wind and flutter
  // around that lean, each with its own speed and phase so nothing moves in lockstep.
  windSwayAt(tileX) {
    const t = performance.now() / 1000;
    const dir = Math.tanh(Math.sin(t * 0.021 + 0.7) * 4);
    const strength = this.windStrength(t - tileX / WIND_SPEED);
    const h = ((tileX * 2654435761) >>> 0) / 4294967296;
    const flutter = Math.sin(t * (2.6 + h * 1.8) + h * 40) + 0.45 * Math.sin(t * (6.3 + h * 2.5) + h * 17);
    // A slight lean with the wind plus a back-and-forth flutter around it.
    return dir * strength * (0.15 + 0.75 * flutter) * WIND_MAX_BEND;
  }

  // Screen-pixel shift for the leaf block at (tileX, tileY). It follows the same gusts as
  // the plants but varies smoothly across the canopy, so neighbouring leaves move almost
  // together (no gaps) and a whole crown ripples as a gust passes.
  leafSwayOffset(tileX, tileY, size) {
    const t = performance.now() / 1000;
    const dir = Math.tanh(Math.sin(t * 0.021 + 0.7) * 4);
    const strength = this.windStrength(t - tileX / WIND_SPEED);
    const ripple = 0.65 + 0.35 * Math.sin(t * 1.9 - tileX * 0.35 + tileY * 0.45);
    return Math.round(dir * strength * ripple * LEAF_MAX_SWAY * size / 16);
  }

  // How far (texels) a trunk in column tileX leans at TRUNK_REF_HEIGHT: slow and stiff,
  // following the same travelling gusts as the leaves above it.
  trunkSwayAt(tileX) {
    const t = performance.now() / 1000;
    const dir = Math.tanh(Math.sin(t * 0.021 + 0.7) * 4);
    const strength = this.windStrength(t - tileX / WIND_SPEED);
    const sway = 0.55 + 0.45 * Math.sin(t * 1.3 + tileX * 0.9);
    return dir * strength * sway * TRUNK_MAX_BEND;
  }

  // Draws a standing log bent by the wind. Its height up the trunk (logs below it) sets
  // how far it moves, so the base stays rooted and the bend grows towards the top.
  drawTrunk(texture, tileX, tileY, sx, sy, size, lightFactor) {
    const { world } = this;
    let below = 0;
    while (below < 16 && world.inBounds(tileX, tileY + below + 1)) {
      const cell = world.getCell(tileX, tileY + below + 1);
      if (!isTrunk(cell.id) || cell.meta?.axis === 'x') break;
      below++;
    }
    const px = size / 16;
    const sway = this.trunkSwayAt(tileX) * px;
    const offsetAt = row => {
      const height = below + (16 - row) / 16;
      const k = Math.min(1.4, height / TRUNK_REF_HEIGHT);
      return Math.round(sway * k * k);
    };
    if (offsetAt(0) === 0) {
      this.drawBlockTexture(texture, sx, sy, size, lightFactor);
      return;
    }
    const quant = Math.max(MIN_BRIGHTNESS, Math.min(1, Math.round(lightFactor * 50) / 50));
    const image = quant >= 1 ? texture : this.getTintedTexture(texture, quant);
    const scale = size / (image.height || 16);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    for (let row = 0; row < 16;) {
      const offset = offsetAt(row);
      let end = row + 1;
      while (end < 16 && offsetAt(end) === offset) end++;
      const y0 = Math.round(sy + row * scale);
      const y1 = Math.round(sy + end * scale);
      ctx.drawImage(image, 0, row, image.width, end - row, sx + offset, y0, size, y1 - y0);
      row = end;
    }
  }

  // Draws a plant bent by `sway` texels at its tip, curving smoothly down to a still base.
  drawSwaying(texture, sx, sy, size, lightFactor, sway, stiffness = 1) {
    const box = this.getOpaqueBounds(texture);
    const px = size / 16;
    if (!box || Math.abs(sway * stiffness * px) < 0.5) {
      this.drawBlockTexture(texture, sx, sy, size, lightFactor);
      return;
    }
    const quant = Math.max(MIN_BRIGHTNESS, Math.min(1, Math.round(lightFactor * 50) / 50));
    const image = quant >= 1 ? texture : this.getTintedTexture(texture, quant);
    const scale = size / (image.height || 16);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    if (box.y > 0) ctx.drawImage(image, 0, 0, image.width, box.y, sx, sy, size, Math.round(box.y * scale));
    const bottom = box.y + box.h;
    const offsetAt = row => {
      // 0 at the base, 1 at the tip; curved so the bend grows towards the top like a stem.
      const height = (bottom - row) / box.h;
      return Math.round(sway * stiffness * px * Math.pow(height, 1.3));
    };
    // Draw runs of rows that share an offset in one call, so a plant costs a few draws.
    for (let row = box.y; row < bottom;) {
      const offset = offsetAt(row);
      let end = row + 1;
      while (end < bottom && offsetAt(end) === offset) end++;
      const y0 = Math.round(sy + row * scale);
      const y1 = Math.round(sy + end * scale);
      ctx.drawImage(image, 0, row, image.width, end - row, sx + offset, y0, size, y1 - y0);
      row = end;
    }
    if (bottom < image.height) ctx.drawImage(image, 0, bottom, image.width, image.height - bottom, sx, Math.round(sy + bottom * scale), size, size - Math.round(bottom * scale));
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
    if (!isTextureReady(texture)) return null;
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
    if (!isTextureReady(texture)) return texture;
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
    if (!isTextureReady(texture)) return null;

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
    let sy = Math.round(camera.worldToScreenY(tileY * TILE_SIZE));
    const size = Math.round(TILE_SIZE * camera.zoom);
    // Falling blocks slide down from the cell above rather than jumping a whole block.
    if (meta?.fellAt) {
      const t = (performance.now() - meta.fellAt) / (meta.slideMs || FALL_SLIDE_MS);
      if (t < 1) sy -= Math.round((1 - t) * size);
    }
    
    const isLightSource = type.lightLevel > 0;
    const finalLightFactor = !isLightSource && this.isOpenSky(tileX, tileY)
      ? this.lightFactorAt(tileX, tileY, true)
      : 1.0;

    // Bushes come in sizes (meta.size 1-4), each with its own texture.
    const textureId = type.id === 'bush' ? `bush_${meta?.size ?? 4}` : type.id;
    let texture = this.textures[textureId] || this.textures[type.id] || this.missingTextureFor(type);
    texture = this.biomeTexture(textureId, texture, tileX);
    if (type.id === 'water' && texture) {
      this.drawWater(texture, tileX, tileY, sx, sy, size, finalLightFactor, waterLevel({ id: 'water', meta }));
      return;
    }
    if ((type.id === 'rock' || type.id === 'pebble') && texture) {
      this.drawRock(texture, sx, sy, size, meta, finalLightFactor);
      return;
    }
    if (type.id.endsWith('_leaves') && texture && meta?.layer !== 'bg') {
      this.drawBlockTexture(texture, sx + this.leafSwayOffset(tileX, tileY, size), sy, size, finalLightFactor);
      return;
    }
    if (WIND_SWAY.has(type.id) && texture && meta?.layer !== 'bg') {
      this.drawSwaying(texture, sx, sy, size, finalLightFactor, this.windSwayAt(tileX), WIND_STIFFNESS[type.id] ?? 1);
      return;
    }
    if (texture && meta?.axis !== 'x' && meta?.layer !== 'bg' && isTrunk(type.id)) {
      this.drawTrunk(texture, tileX, tileY, sx, sy, size, finalLightFactor);
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
