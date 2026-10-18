import { isGrassyCell, bareIdOf } from '../../assets/blocks/grassSpread.js';
import { gameClock } from './gameClock.js';
import { TILE_SIZE, darkenHex } from './utils.js';
import { Clouds } from './clouds.js';
import { polishOn } from './polishSettings.js';
import { ClassicClouds } from './clouds_classic.js';
import { drawSkyGradient, drawHills, isOutlined, edgePass, drawVignette, outlineLayer, blockSeams, screenOutline, cornerRect } from './polish.js';
import { keptLeafCover } from '../logic/trunkLeaves.js';
import { naturalHeightAt, naturalDirtDepthAt, lakeWaterTopAt, sampleBlockAt } from '../logic/terrainGen.js';
import { waterLevel, waterMass, WATER_LEVELS, SQ as WATER_SQ } from '../logic/water.js';
import { grassColorAt, leafColorAt, biomeHasLeafTint, fogAt, ROCK_SCALES } from '../logic/biomes.js';
import { perf } from './perf.js';
import { waterPerf } from './waterPerf.js';

const NAME_TAG_NEAR = 15;   // blocks: name tags are fully shown up to here
const NAME_TAG_FAR = 20;    // and have faded away completely by here

const MIN_BRIGHTNESS = 0.04;
const _rawSplat = [];
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx * dx + dy * dy <= 2) _rawSplat.push(dx, dy);
const SPLAT_LEN = _rawSplat.length >> 1;
const SPLAT_DX = new Int32Array(SPLAT_LEN);
const SPLAT_DY = new Int32Array(SPLAT_LEN);
for (let i = 0; i < SPLAT_LEN; i++) {
  SPLAT_DX[i] = _rawSplat[i * 2];
  SPLAT_DY[i] = _rawSplat[i * 2 + 1];
}
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
const GRASS_SIDES = ['top', 'right', 'bottom', 'left'];
// Textures (not blocks) whose green pixels take on the local biome's grass colour. Blocks
// say so themselves with `biomeTint: true`.
const BIOME_TINTED = new Set([
  'grass_corner',
  'grass_overlay_top', 'grass_overlay_right', 'grass_overlay_bottom', 'grass_overlay_left'
]);
// Plants that bend in the wind: the tip leans furthest, the base stays put.
const WIND_MAX_BEND = 2.5;   // texels the tip of a plant bends in the strongest gust
const WIND_SPEED = 14;       // tiles per second a gust travels across the land
const TRUNK_MAX_BEND = 2.2;  // texels the top of a TRUNK_REF_HEIGHT-tall trunk bends in a gust
const TRUNK_REF_HEIGHT = 9;   // trunk height (blocks) that reaches the full bend
const LEAF_MAX_SWAY = 1.6;   // texels a leaf block shifts in the strongest gust
const FOG_SMOOTH = 5;          // columns either side averaged for the fog's ground line
const FOG_TEXELS_PER_TILE = 8; // mist texture texels per block column (texture is 256 wide)
const FALL_SLIDE_MS = 120;   // matches world.js FALL_TICK_INTERVAL
const LEAF_FRINGE_DEPTH = 2;


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
const TOOL_GRIP_OFFSETS = { sword: 0.36, pickaxe: 0.26, axe: 0.26, shovel: 0.26, hoe: 0.26, stick: 0.3 };
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
    for (const [id, def] of this.registry.map) if (def.leaves) ids.add(`falling_leaf_${id}`);
    for (const [id, def] of this.registry.map) if (def.kind === 'chest') ids.add(`${id}_left`).add(`${id}_right`);
    for (const id of ['oak_leaf_particle', 'falling_leaf', 'steve', 'no_texture', 'grass_corner']) ids.add(id);
    for (const side of GRASS_SIDES) ids.add(`grass_overlay_${side}`);
    for (const [id, def] of this.registry.map) for (let i = 1; i <= (def.variants?.count ?? 0); i++) ids.add(`${id}_${i}`);

    for (const textureId of ids) {
      if (textureId === 'air' || textureId === 'double_slab' || this.textures[textureId]) continue;
      const image = new Image();
      image.onload = () => {
        this.textures[textureId] = image;
      };
      image.onerror = () => {
        this.missingTextures.add(textureId);
      };
      image.src = `assets/textures/${textureId}.png`;
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

    perf.startPhase('renderTotal');
    try {
      perf.startPhase('renderSkyHills');
      this.updateDaylight();
      this.updateHeldLight(ui);
      this.drawSky();
      // Clouds drift across the sky behind everything else; dimmer at night.
      if (!this.clouds) { this.clouds = new Clouds(); this.classicClouds = new ClassicClouds(); }
      (polishOn('clouds') ? this.clouds : this.classicClouds).draw(ctx, this.camera, canvas, world.seed ?? 0, this.daylight?.base ?? 1);
      const polish = ui?.textureQuality !== 'fast';
      this._polish = polish;
      if (polish && polishOn('hills')) drawHills(ctx, this.camera, canvas, world.seed ?? 0, this._skyRGB, this.daylight?.base ?? 1);
      perf.endPhase('renderSkyHills');

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

      perf.startPhase('renderLightPropagation');
      const lightNow = performance.now();
      const lightDt = this._lastLightTime ? Math.min(0.1, (lightNow - this._lastLightTime) / 1000) : 0;
      this._lastLightTime = lightNow;
      world.updateDisplayLight(lightDt, startX - 1, endX + 1, startY - 1, endY + 1);
      this.updatePlacedLight(startX, endX, startY, endY);
      perf.endPhase('renderLightPropagation');

      // Mist sits behind the land and trees, filling the open air between them.
      perf.startPhase('renderFog');
      this.drawFog(startX, endX);
      perf.endPhase('renderFog');

      // Solid foreground blocks go on their own layer so their open corners can be rounded.
      const terrain = polish && (polishOn('outlines') || polishOn('rounding') || polishOn('seams') || polishOn('wallShadows')) ? this.terrainLayer() : null;
      const terrainCtx = terrain?.getContext('2d');
      if (terrainCtx) terrainCtx.setTransform(ctx.getTransform());
      // Leaves get a layer too, so the whole canopy can be outlined.
      const leafLayer = polish && polishOn('leaves') ? this.terrainLayer('_leafLayer') : null;
      const leafCtx = leafLayer?.getContext('2d');
      if (leafCtx) leafCtx.setTransform(ctx.getTransform());
      this._splashes = [];
      this._waterFrame = (this._waterFrame || 0) + 1;

      perf.startPhase('renderBlocks');
      let renderedBlocksCount = 0;
      for (let x = startX; x <= endX; x++) {
        if (!world.isChunkLoaded(world.chunkXFor(x))) continue;
        for (let y = startY; y <= endY; y++) {
          const cell = world.getCell(x, y);
          const t = this.registry.get(cell.id);
          if (!t) continue;
          // Anything that doesn't fill its cell (plants, slabs, stairs, trapdoors) shows the wall behind it.
          if (!t.solid || cell.id === 'air' || (t.shape && t.shape !== 'full')) {
            // A background block placed behind this one (a torch on a planks wall...).
            const bgType = cell.meta?.bgId ? this.registry.get(cell.meta.bgId) : null;
            if (bgType) {
              if (leafCtx && bgType.leaves) {
                this.ctx = leafCtx;
                this.drawBlock(x, y, bgType, { layer: 'bg' });
                this.ctx = ctx;
              } else {
                this.drawBlock(x, y, bgType, { layer: 'bg' });
                if (polish && bgType.solid && polishOn('seams')) this.seamTile(x, y);
              }
              renderedBlocksCount++;
            }
            // Lakes have a fixed sand backdrop where their water was generated; it stays put
            // whatever the water in front of it does.
            else if (cell.meta?.noWall) { /* the natural wall here was mined out */ }
            else if (this.isLakeBackdrop(x, y)) { this.drawBackgroundWall(x, y, ui?.textureQuality === 'fast', 'sand'); renderedBlocksCount++; }
            else if (!this.isOpenSky(x, y)) { this.drawBackgroundWall(x, y, ui?.textureQuality === 'fast'); renderedBlocksCount++; }
            if (cell.id === 'air') continue;
          }
          // A block still sliding into its cell leaves the cell's bottom uncovered: fill it.
          if (cell.meta?.fellAt && gameClock.now() - cell.meta.fellAt < (cell.meta.slideMs || FALL_SLIDE_MS) && gameClock.now() >= cell.meta.fellAt) {
            if (this.isLakeBackdrop(x, y)) this.drawBackgroundWall(x, y, ui?.textureQuality === 'fast', 'sand');
            else if (y >= this.naturalSurfaceAt(x)) this.drawBackgroundWall(x, y, ui?.textureQuality === 'fast');
          }
          // Water (still and moving) is drawn after the blocks, all at once (drawWaterLayer).
          if (cell.id === 'water') continue;
          if (leafCtx && this.registry.get(cell.id)?.leaves) {
            this.ctx = leafCtx;
            this.drawBlock(x, y, t, cell.meta || {});
            this.ctx = ctx;
            renderedBlocksCount++;
          } else if (terrainCtx && isOutlined(t, cell.meta)) {
            this.ctx = terrainCtx;
            this.drawBlock(x, y, t, cell.meta || {});
            this.ctx = ctx;
            renderedBlocksCount++;
          } else {
            this.drawBlock(x, y, t, cell.meta || {});
            renderedBlocksCount++;
          }
        }
      }
      perf.endPhase('renderBlocks');

      perf.startPhase('renderPolish');
      if (polish && polishOn('connectedGrass')) {
        perf.startPhase('renderGrassCorners');
        this.drawGrassCorners(terrainCtx || ctx, startX, endX, startY, endY);
        perf.endPhase('renderGrassCorners');
      }
      if (leafCtx) {
        perf.startPhase('renderLeafFringes');
        this.ctx = leafCtx;
        this.drawLeafFringes(startX, endX, startY, endY);
        this.ctx = ctx;
        perf.endPhase('renderLeafFringes');

        perf.startPhase('renderLeafOutlines');
        outlineLayer(leafLayer, camera.zoom);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(leafLayer, 0, 0);
        ctx.restore();
        perf.endPhase('renderLeafOutlines');
      }
      if (terrainCtx) {
        perf.startPhase('renderEdgePass');
        edgePass(this, terrainCtx, ctx, startX, endX, startY, endY);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(terrain, 0, 0);
        ctx.restore();
        perf.endPhase('renderEdgePass');
      }
      if (polish && polishOn('rounding') && !(shake && (shake.x || shake.y))) {
        perf.startPhase('renderWallCorners');
        this.roundWallCorners(startX, endX, startY, endY);
        perf.endPhase('renderWallCorners');
      }
      perf.endPhase('renderPolish');

      perf.startPhase('renderWater');
      this.drawWaterLayer(startX, endX, startY, endY);

      // Foam and bubbles go on top of the water cells around them.
      perf.startPhase('renderSplashes');
      this.drawSplashes();
      perf.endPhase('renderSplashes');
      perf.endPhase('renderWater');

      if (!leafCtx) {
        perf.startPhase('renderLeafFringes');
        this.drawLeafFringes(startX, endX, startY, endY);
        perf.endPhase('renderLeafFringes');
      }

      perf.startPhase('renderLightOverlay');
      this.drawLightOverlay(startX, endX, startY, endY);
      if (ui?.textureQuality !== 'fast') {
        perf.startPhase('renderLightTint');
        this.drawLightTint(startX, endX, startY, endY);
        perf.endPhase('renderLightTint');
      }
      perf.endPhase('renderLightOverlay');

      this.drawBreakingProgress();
      // The player and dropped items are drawn on their own layer, so the water in front of
      // them can tint just their pixels (they look submerged) before it goes on screen.
      perf.startPhase('renderEntities');
      const layer = this.entityLayer();
      const mainCtx = this.ctx;
      this.ctx = layer.getContext('2d');
      this.ctx.setTransform(mainCtx.getTransform());
      const others = this.drawRemotePlayers();
      this.drawPlayer();
      this.drawHurtTint(this.player);
      this.drawItems();
      const p = this.player;
      const rects = [[p.x - 8, p.y - 8, p.width + 16, p.height + 8]];
      for (const rp of others) rects.push([rp.x - 8, rp.y - 8, rp.width + 16, rp.height + 8]);
      for (const item of world.items || []) rects.push([item.x - 8, item.y - 8, 16, 16]);
      if (polish && polishOn('entityOutlines')) {
        perf.startPhase('renderEntityOutlines');
        outlineLayer(layer, camera.zoom);
        perf.endPhase('renderEntityOutlines');
      }
      this.ctx.globalCompositeOperation = 'source-atop';
      this.drawWaterOver(rects);
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx = mainCtx;
      mainCtx.save();
      mainCtx.setTransform(1, 0, 0, 1, 0, 0);
      if (layer.width && layer.height) mainCtx.drawImage(layer, 0, 0);
      mainCtx.restore();
      perf.endPhase('renderEntities');

      perf.startPhase('renderEffects');
      this.drawLeafParticles();
      this.drawPrimedExplosives(ui?.primedExplosives);
      this.drawHurtVignette();
      if (ui?.explosionFX) ui.explosionFX.draw(ctx, camera);
      this.drawHoveredBlockOutline();
      this.drawPositionOutlines();
      if (shake && (shake.x || shake.y)) ctx.restore();
      if (polish && polishOn('vignette')) drawVignette(ctx, canvas);
      perf.endPhase('renderEffects');

      perf.setCounts({
        visibleTiles: (endX - startX + 1) * (endY - startY + 1),
        renderedBlocks: renderedBlocksCount,
        loadedChunks: world.chunks?.size || 0,
        itemsCount: world.items?.length || 0,
        particlesCount: this.leafParticles?.length || 0,
        canvasW: canvas.width,
        canvasH: canvas.height,
        dpr: window.devicePixelRatio || 1
      });
    } finally {
      perf.endPhase('renderTotal');
    }
  }

  // A canvas the size of the screen, cleared, for the solid blocks.
  terrainLayer(key = '_terrain') {
    const { canvas } = this;
    if (!this[key]) this[key] = document.createElement('canvas');
    const c = this[key];
    if (c.width !== canvas.width || c.height !== canvas.height) { c.width = canvas.width; c.height = canvas.height; }
    const tctx = c.getContext('2d');
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, c.width, c.height);
    tctx.imageSmoothingEnabled = false;
    return c;
  }

  // Inner grass corners, worked out on the quarter-cell grid so slabs and stairs join too:
  // where two grassy quarters meet around a filled quarter's corner with the diagonal quarter
  // open, a grass patch is laid over that corner so the two bands join.
  getOrientedCorner(tex, dx, dy) {
    const idx = (dy > 0 ? 2 : 0) + (dx > 0 ? 1 : 0);
    if (!tex._cornerSprites) tex._cornerSprites = [];
    if (!tex._cornerSprites[idx]) {
      const tw = tex.width || 16;
      const th = tex.height || 16;
      const qw = Math.floor(tw / 2);
      const qh = Math.floor(th / 2);
      const c = document.createElement('canvas');
      c.width = qw;
      c.height = qh;
      const cctx = c.getContext('2d');
      cctx.imageSmoothingEnabled = false;
      cctx.translate(dx > 0 ? qw : 0, dy > 0 ? qh : 0);
      cctx.scale(dx > 0 ? -1 : 1, dy > 0 ? -1 : 1);
      cctx.drawImage(tex, 0, 0, tw, th);
      tex._cornerSprites[idx] = c;
    }
    return tex._cornerSprites[idx];
  }

  // Inner grass corners, worked out on the quarter-cell grid so slabs and stairs join too:
  // where two grassy quarters meet around a filled quarter's corner with the diagonal quarter
  // open, a grass patch is laid over that corner so the two bands join.
  drawGrassCorners(target, startX, endX, startY, endY) {
    const { world, camera } = this;
    const base = this.textures.grass_corner;
    if (!base) return;

    const spanX = endX - startX + 5;
    const spanY = endY - startY + 5;
    const ox = startX - 2, oy = startY - 2;
    const totalCells = spanX * spanY;
    if (!this._qCache || this._qCache.length < totalCells) {
      this._qCache = new Int16Array(totalCells);
    }
    this._qCache.fill(-1, 0, totalCells);
    const qCache = this._qCache;

    const quartersAt = (bx, by) => {
      const ix = bx - ox, iy = by - oy;
      if (ix < 0 || ix >= spanX || iy < 0 || iy >= spanY) return 0;
      const idx = iy * spanX + ix;
      let q = qCache[idx];
      if (q === -1) {
        const fill = this.blockQuarters(bx, by);
        q = fill | (isGrassyCell(world.getCell(bx, by)) ? fill << 4 : 0);
        qCache[idx] = q;
      }
      return q;
    };

    // Quarter (gx, gy) on the half-cell grid: 1 filled, 2 filled and grassy.
    const at = (gx, gy) => {
      const q = quartersAt(Math.floor(gx / 2), Math.floor(gy / 2));
      const bit = 1 << ((gy & 1) * 2 + (gx & 1));
      return (q & (bit << 4)) ? 2 : (q & bit) ? 1 : 0;
    };

    target.imageSmoothingEnabled = false;
    for (let x = startX; x <= endX; x++) {
      if (!world.isChunkLoaded(world.chunkXFor(x))) continue;
      for (let y = startY; y <= endY; y++) {
        if (!(quartersAt(x, y) & 15)) continue;
        const sx = Math.round(camera.worldToScreenX(x * TILE_SIZE));
        const sy = Math.round(camera.worldToScreenY(y * TILE_SIZE));
        const size = Math.round(camera.worldToScreenX((x + 1) * TILE_SIZE)) - sx;
        const half = size / 2;
        for (let q = 0; q < 4; q++) {
          const gx = x * 2 + (q & 1), gy = y * 2 + (q >> 1);
          if (!at(gx, gy)) continue;
          for (const dy of [-1, 1]) {
            for (const dx of [-1, 1]) {
              if (at(gx + dx, gy + dy) || at(gx + dx, gy) !== 2 || at(gx, gy + dy) !== 2) continue;
              const tex = this.biomeTexture('grass_corner', base, x);
              const qx = sx + (q & 1) * half, qy = sy + (q >> 1) * half;
              const sprite = this.getOrientedCorner(tex, dx, dy);
              target.drawImage(sprite, qx, qy, half, half);
            }
          }
        }
      }
    }
  }

  // Which quarters of a cell a block fills: bits 1 top-left, 2 top-right, 4 bottom-left, 8 bottom-right.
  blockQuarters(x, y) {
    const t = this.world.inBounds(x, y) ? this.world.getBlockType(x, y) : null;
    if (!t || !t.solid) return 0;
    const meta = this.world.getCell(x, y)?.meta || {};
    if (meta.layer === 'bg') return 0;
    if (!t.shape || t.shape === 'full') return 15;
    if (t.shape === 'slab') {
      if ((t.thickness ?? 8) < 8 || meta.open) return 0;
      return (meta.slabPos || 'bottom') === 'top' ? 3 : 12;
    }
    if (t.shape === 'stairs') return (meta.orient || 'right') === 'right' ? 14 : 13;
    return 0;
  }

  // Connected grass (purely visual): the soil texture with grass overlay bands laid along every
  // edge of the block's shape that faces open air, quarter by quarter, so slabs and stairs next
  // to each other only get grass where it shows. meta.sides (1 up, 2 right, 4 down, 8 left)
  // limits which directions have grown in so far.
  grassOverlay(tileX, tileY, meta) {
    const own = this.blockQuarters(tileX, tileY);
    const grown = meta?.sides ?? 15;
    const near = {
      0: own,
      up: this.blockQuarters(tileX, tileY - 1), down: this.blockQuarters(tileX, tileY + 1),
      left: this.blockQuarters(tileX - 1, tileY), right: this.blockQuarters(tileX + 1, tileY)
    };
    const filled = (qx, qy) => {
      let cell = 0;
      if (qy < 0) { cell = 'up'; qy += 2; } else if (qy > 1) { cell = 'down'; qy -= 2; }
      else if (qx < 0) { cell = 'left'; qx += 2; } else if (qx > 1) { cell = 'right'; qx -= 2; }
      return near[cell] & (1 << (qy * 2 + qx));
    };
    const edges = [];
    for (let q = 0; q < 4; q++) {
      if (!(own & (1 << q))) continue;
      const qx = q & 1, qy = q >> 1;
      // Edges inside the cell (a stair's riser) grow along with the top.
      const has = (bit, inside) => grown & (inside ? 1 : bit);
      if (has(1, qy > 0) && !filled(qx, qy - 1)) edges.push(`t${q}`);
      if (has(2, qx < 1) && !filled(qx + 1, qy)) edges.push(`r${q}`);
      if (has(4, qy < 1) && !filled(qx, qy + 1)) edges.push(`b${q}`);
      if (has(8, qx > 0) && !filled(qx - 1, qy)) edges.push(`l${q}`);
    }
    if (!edges.length) return null;
    const id = `grass_overlay|${edges.join(',')}`;
    if (this.textures[id]) return id;
    const bands = { t: 'top', r: 'right', b: 'bottom', l: 'left' };
    for (const side of GRASS_SIDES) if (!isTextureReady(this.textures[`grass_overlay_${side}`])) return null;
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (const e of edges) {
      const q = +e[1], qx = (q & 1) * 8, qy = (q >> 1) * 8;
      // Shift the band so it sits on this quarter's edge, then keep only this quarter.
      const dx = e[0] === 'l' ? qx : e[0] === 'r' ? qx - 8 : 0;
      const dy = e[0] === 't' ? qy : e[0] === 'b' ? qy - 8 : 0;
      g.save();
      g.beginPath();
      g.rect(qx, qy, 8, 8);
      g.clip();
      g.drawImage(this.textures[`grass_overlay_${bands[e[0]]}`], dx, dy);
      g.restore();
    }
    this.textures[id] = c;
    BIOME_TINTED.add(id);
    return id;
  }

  leafFoot(texture, rotation, size) {
    this._leafPixels ??= new Map();
    let pts = this._leafPixels.get(texture);
    if (!pts) {
      if (!isTextureReady(texture)) return size / 2;
      pts = [];
      try {
        const c = document.createElement('canvas');
        c.width = 16; c.height = 16;
        const x = c.getContext('2d');
        x.drawImage(texture, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data;
        for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if (d[(j * 16 + i) * 4 + 3] > 128) pts.push([i + 0.5 - 8, j + 1 - 8]);
      } catch { /* leave empty */ }
      this._leafPixels.set(texture, pts);
    }
    if (!pts.length) return size / 2;
    const sin = Math.sin(rotation), cos = Math.cos(rotation);
    let foot = -Infinity;
    for (const [px, py] of pts) foot = Math.max(foot, px * sin + py * cos);
    return foot * size / 16;
  }

  // Average colour of a texture's opaque pixels, cached per texture.
  averageColor(texture) {
    this._avgColors ??= new Map();
    let c = this._avgColors.get(texture);
    if (!c) {
      if (!isTextureReady(texture)) return [80, 120, 60];
      c = [80, 120, 60];
      try {
        const cv = document.createElement('canvas');
        cv.width = 16; cv.height = 16;
        const x = cv.getContext('2d');
        x.drawImage(texture, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        if (n) c = [r / n, g / n, b / n];
      } catch { /* not loaded yet */ }
      if (this._avgColors.size > 256) this._avgColors.clear();
      this._avgColors.set(texture, c);
    }
    return c;
  }

  updateDaylight() {
    const world = this.world;
    const timeOfDay = (world.time % world.dayLength) / world.dayLength;
    const sunPhase = (timeOfDay - 0.25 + 1) % 1;
    const sunVisible = sunPhase <= 0.5;
    const travelT = sunVisible ? sunPhase / 0.5 : (sunPhase - 0.5) / 0.5;
    const s = Math.sin(Math.PI * travelT);
    // One smooth curve on the sun's height (negative below the horizon) so light eases
    // through dusk and dawn instead of jumping when the sun sets.
    const elevation = sunVisible ? s : -s;
    const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const ambient = NIGHT_LIGHT + (1 - NIGHT_LIGHT) * smooth(-0.45, 0.45, elevation);
    const base = NIGHT_LIGHT + (1 - NIGHT_LIGHT) * smooth(-0.3, 1, elevation);
    this.daylight = { sunVisible, travelT, base, ambient };
  }

  lightFactorAt(tileX, tileY, dayBoost) {
    // The light effect (/effect light): see everything as if in full daylight.
    if (this.effects?.light) return 1;
    const world = this.world;
    const { ambient } = this.daylight;
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
    // Torches held by other players in multiplayer light the world too.
    const holders = [[player, this.getHeldSlot(ui)]];
    const mp = typeof window !== 'undefined' ? window.multiplayer : null;
    if (mp?.active) for (const rp of mp.remotePlayers.values()) holders.push([rp, rp.held]);
    for (const [p, slot] of holders) {
      const type = this.registry.get(slot?.blockId || slot?.itemId);
      if (type?.shape !== 'torch') continue;
      if (!this.heldLightColor) this.heldLightColor = type.lightColor || null;
      const levels = this.floodHeldLight((p.x + p.width / 2) / TILE_SIZE, (p.y + p.height * 0.4) / TILE_SIZE, HELD_LIGHT_RANGE);
      if (!this.heldLight) { this.heldLight = levels; continue; }
      for (const [k, v] of levels) if ((this.heldLight.get(k) ?? 0) < v) this.heldLight.set(k, v);
    }
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
    const { ambient } = this.daylight;
    const dark = this.effects?.light ? 0 : 1 - Math.min(1, (this.world.getDisplaySkyLight(tileX, tileY) / 15) * ambient);
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
    if (!world.inBounds(tileX, tileY)) return false;
    // Blocks that don't fill their cell (slabs, trapdoors) don't hide the sky behind them.
    const type = world.getBlockType(tileX, tileY);
    const cell = world.getCell(tileX, tileY);
    if (type && type.solid && (!type.shape || type.shape === 'full') && cell.meta?.layer !== 'bg') return false;
    if (cell.meta?.layer === 'bg' || cell.meta?.bgId) return false;
    if (cell.meta?.noWall) return true;
    if (this.isLakeBackdrop(tileX, tileY)) return false;
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

  // The natural wall block behind an empty cell (what mining it gives), or null.
  naturalWallId(tileX, tileY) {
    const cell = this.world.getCell(tileX, tileY);
    if (cell.meta?.noWall || cell.meta?.bgId) return null;
    if (this.isLakeBackdrop(tileX, tileY)) return 'sand';
    if (this.isOpenSky(tileX, tileY)) return null;
    return this.backgroundWallId(tileX, tileY);
  }

  backgroundWallTexture(tileX, tileY) {
    return this.textures[this.backgroundWallId(tileX, tileY)] || null;
  }

  backgroundWallId(tileX, tileY) {
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
    if (generated === 'sand' || generated === 'wet_sand') return this.textures[generated] ? generated : 'sand';
    const depth = tileY - this.naturalSurfaceAt(tileX);
    const dirtDepth = naturalDirtDepthAt(tileX, world.seed ?? 0, world.worldType);
    return depth <= dirtDepth ? 'dirt' : 'stone';
  }

  // Is something behind or in front at this cell (a block, or a wall)? Open sky isn't.
  hasBackdrop(tileX, tileY) {
    const world = this.world;
    if (!world.inBounds(tileX, tileY) || !world.isChunkLoaded(world.chunkXFor(tileX))) return true;
    const t = world.getBlockType(tileX, tileY);
    const cell = world.getCell(tileX, tileY);
    if (t && t.solid && (!t.shape || t.shape === 'full') && cell.meta?.layer !== 'bg') return true;
    if (cell.meta?.bgId || cell.meta?.layer === 'bg') return true;
    return this.naturalWallId(tileX, tileY) !== null;
  }

  // Rounds the corners where background walls meet open sky: an inside corner (sky cell
  // walled on two sides) gets a dark pixel filling its corner; an outside corner (wall
  // cell with sky on two sides) gets its corner pixel replaced by the sky beside it.
  roundWallCorners(startX, endX, startY, endY) {
    const { ctx, camera, canvas, world } = this;
    const u = Math.max(1, Math.round(camera.zoom));
    const isWall = (x, y) => {
      const t = world.inBounds(x, y) ? world.getBlockType(x, y) : null;
      if (t && t.solid && (!t.shape || t.shape === 'full')) return false; // front blocks round themselves
      return this.hasBackdrop(x, y);
    };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    for (let x = startX; x <= endX; x++) {
      if (!world.isChunkLoaded(world.chunkXFor(x))) continue;
      for (let y = startY; y <= endY; y++) {
        const wall = isWall(x, y);
        const sky = !this.hasBackdrop(x, y);
        if (!wall && !sky) continue;
        const sx = Math.round(camera.worldToScreenX(x * TILE_SIZE));
        const sy = Math.round(camera.worldToScreenY(y * TILE_SIZE));
        const ex = Math.round(camera.worldToScreenX((x + 1) * TILE_SIZE));
        const ey = Math.round(camera.worldToScreenY((y + 1) * TILE_SIZE));
        for (const dy of [-1, 1]) {
          for (const dx of [-1, 1]) {
            const cx = dx < 0 ? sx : ex - u, cy = dy < 0 ? sy : ey - u;
            if (sky && this.hasBackdrop(x + dx, y) && this.hasBackdrop(x, y + dy)) {
              ctx.fillStyle = 'rgba(14, 12, 12, 0.8)';
              ctx.fillRect(cx, cy, u, u);
            } else if (wall && !this.hasBackdrop(x + dx, y) && !this.hasBackdrop(x, y + dy) && !this.hasBackdrop(x + dx, y + dy)) {
              // Copy the sky from just outside the corner over the corner pixel.
              const ox = cx + dx * u, oy = cy;
              if (ox < 0 || ox + u > canvas.width || oy < 0 || oy + u > canvas.height) continue;
              ctx.drawImage(canvas, ox, oy, u, u, cx, cy, u, u);
              ctx.fillStyle = 'rgba(14, 12, 12, 0.8)';
              ctx.fillRect(cx - dx * u, cy - dy * u, u, u);
            }
          }
        }
      }
    }
    ctx.restore();
  }

  // Dark edges on a background wall where it meets open sky (they move as walls are mined).
  outlineWall(tileX, tileY, left, top, w, h) {
    const ctx = this.ctx;
    const u = Math.max(1, Math.round(this.camera.zoom));
    ctx.fillStyle = 'rgba(14, 12, 12, 0.8)';
    if (!this.hasBackdrop(tileX, tileY - 1)) ctx.fillRect(left, top, w, u);
    if (!this.hasBackdrop(tileX, tileY + 1)) ctx.fillRect(left, top + h - u, w, u);
    if (!this.hasBackdrop(tileX - 1, tileY)) ctx.fillRect(left, top, u, h);
    if (!this.hasBackdrop(tileX + 1, tileY)) ctx.fillRect(left + w - u, top, u, h);
  }

  seamTile(tileX, tileY) {
    const { camera } = this;
    const left = Math.round(camera.worldToScreenX(tileX * TILE_SIZE));
    const top = Math.round(camera.worldToScreenY(tileY * TILE_SIZE));
    blockSeams(this.ctx, left, top, Math.round(camera.worldToScreenX((tileX + 1) * TILE_SIZE)) - left,
      Math.round(camera.worldToScreenY((tileY + 1) * TILE_SIZE)) - top, Math.max(1, Math.round(camera.zoom)));
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
      if (this._polish && rows === 16 && polishOn('seams')) blockSeams(ctx, left, top, width, height, Math.max(1, Math.round(camera.zoom)));
      if (this._polish && rows === 16 && polishOn('outlines')) this.outlineWall(tileX, tileY, left, top, width, height);
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
    if (polishOn('smoothLight')) { this.drawSmoothLightOverlay(startX, endX, startY, endY); return; }
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

  // The darkness as one pixel per block, scaled up smoothly, so light fades across blocks
  // instead of stepping block by block.
  drawSmoothLightOverlay(startX, endX, startY, endY) {
    const { ctx, camera } = this;
    const w = endX - startX + 1, h = endY - startY + 1;
    if (!this._darkCanvas) this._darkCanvas = document.createElement('canvas');
    const c = this._darkCanvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; this._darkImg = c.getContext('2d').createImageData(w, h); }
    const d = this._darkImg.data;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const tx = startX + i, ty = startY + j;
        const a = this.isShadedTile(tx, ty) ? Math.max(0, Math.min(1, this.overlayAlphaAt(tx, ty))) : 0;
        const o = (j * w + i) * 4;
        d[o] = d[o + 1] = d[o + 2] = 0;
        d[o + 3] = Math.round(a * 255);
      }
    }
    c.getContext('2d').putImageData(this._darkImg, 0, 0);
    const tile = TILE_SIZE * camera.zoom;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Pixel centres sit on block centres, so the fades run from the middle of one block to
    // the middle of the next.
    ctx.drawImage(c, camera.worldToScreenX(startX * TILE_SIZE), camera.worldToScreenY(startY * TILE_SIZE), w * tile, h * tile);
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
              if (polishOn('seams')) blockSeams(ctx, x, y, tileSize, tileSize, tileSize / 16, true);
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
    if (polishOn('vignette')) drawVignette(ctx, canvas);
    if (polishOn('outlines')) screenOutline(ctx, canvas, 8);
  }

  getBlockColor(blockId) {
    return this.registry.get(blockId)?.color || '#8B4513';
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
    
    this._skyRGB = [r, g, b];
    if (polishOn('sky')) drawSkyGradient(ctx, canvas, r, g, b, this.daylight?.base ?? 1);
    else {
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

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
       const size = Math.max(6, Math.round(7.5 * camera.zoom));
       const itemW = item.width || 6;
       const itemH = item.height || 6;
       const screenCenterX = camera.worldToScreenX(item.x + itemW / 2);
       const screenBottomY = camera.worldToScreenY(item.y + itemH);
       const sx = Math.round(screenCenterX - size / 2);
       const sy = Math.round(screenBottomY - size);
       
       const tileX = Math.floor(item.x / 16);
       const tileY = Math.floor(item.y / 16);
       const combinedLightFactor = this.lightFactorAt(tileX, tileY, false);
       
       const itemId = item.blockId || item.itemId;
       const texture = this.biomeTexture(itemId, this.textures[itemId], tileX);
       
       if (texture) {
         this.drawBlockTexture(texture, sx, sy, size, combinedLightFactor);
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
         
         ctx.fillRect(sx, sy, size, size);
         
         ctx.strokeStyle = '#000000';
         ctx.lineWidth = 1;
         ctx.strokeRect(sx, sy, size, size);
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
      
      const alpha = particle.alpha ?? 1;
      
      let texture = this.textures[`falling_leaf_${particle.blockId}`] || this.textures['falling_leaf'] || this.textures['oak_leaf_particle'] || null;
      if (texture && particle.blockId && biomeHasLeafTint(particle.blockId)) {
        texture = this.getBiomeTinted(`falling_leaf_${particle.blockId}`, texture, Math.floor(particle.x / TILE_SIZE), particle.blockId);
      }

      // How far below its centre the leaf's visible pixels reach at its current spin (world
      // px), so it lands on its real shape rather than its square texture.
      if (texture) particle.foot = this.leafFoot(texture, particle.rotation, TILE_SIZE * 0.8);

      if (texture) {
        ctx.save();
        ctx.globalAlpha = alpha;
        
        const tintedLightFactor = combinedLightFactor * particle.tintFactor;
        
        this.drawBlockTexture(texture, sx - size / 2, sy - size / 2, size, tintedLightFactor, particle.rotation);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = alpha;
        const leafDef = this.registry.get(particle.blockId);
        let c = leafDef?.leaves?.particleColor || leafDef?.color || '#5a9e5a';
        
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
        const cell = world.getCell(x, y);
        const isBg = cell.meta?.layer === 'bg' || (!this.registry.get(cell.id)?.leaves && cell.meta?.bgId);
        const id = this.registry.get(cell.id)?.leaves ? cell.id : (cell.meta?.bgId && this.registry.get(cell.meta.bgId)?.leaves ? cell.meta.bgId : null);
        if (!id) continue;
        let texture = this.textures[id];
        if (!texture) continue;
        if (biomeHasLeafTint(id)) texture = this.getBiomeTinted(id, texture, x);
        for (const [side, dx, dy] of LEAF_FRINGE_SIDES) {
          const nx = x + dx, ny = y + dy;
          if (!world.inBounds(nx, ny)) continue;
          const nCell = world.getCell(nx, ny);
          const nType = world.getBlockType(nx, ny);
          if (nType?.leaves || nType?.solid || (nCell.meta?.bgId && this.registry.get(nCell.meta.bgId)?.leaves)) continue;
          const fringe = this.getLeafFringe(id, texture, side, (x * 7 + y * 13) & 3);
          if (!fringe) continue;
          const sx = Math.round(camera.worldToScreenX(nx * TILE_SIZE)) + this.leafSwayOffset(x, y, size);
          const sy = Math.round(camera.worldToScreenY(ny * TILE_SIZE));
          const light = (this.isOpenSky(nx, ny) ? this.lightFactorAt(nx, ny, true) : 1.0) * (isBg ? BACKGROUND_WALL_SHADE : 1.0);
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
    const t = gameClock.seconds();
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

    // Whether each column still has its ground block (the mist rests on it).
    const fogGroundAt = [];
    for (let x = startX; x <= endX; x++) {
      const top = Math.floor(naturalHeightAt(x, seed, world.height, world.worldType));
      fogGroundAt.push(!world.isChunkLoaded(world.chunkXFor(x)) || !!world.getBlockType(x, top)?.solid);
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
        // No mist over a column whose ground block has been dug out.
        if (!fogGroundAt[x - startX]) continue;
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

  // All the water on screen drawn as 4x4-pixel squares, four across a block (the water sim's
  // squares): deeper squares darker, a bright edge on top and a soft shimmer just under it.
  // Built as one small image (a pixel per square) and drawn scaled up, so it costs one draw
  // however much water there is.
  // Water layer: renders all resting block water and dynamic particles into the 8x8 chunky water canvas.
  drawWaterLayer(startX, endX, startY, endY) {
    const { ctx, camera, world } = this;
    const sim = world.water;
    if (!sim) { this._waterShown = null; return; }
    const particlePos = sim.particles?.positions();
    waterPerf.startRender();
    try {
      const PER = WATER_SQ;
      const cols = endX - startX + 1, rows = endY - startY + 1;
      const gw = cols * PER, gh = rows * PER;
      if (!this._waterCanvas || this._waterCanvas.width !== gw || this._waterCanvas.height !== gh) {
        this._waterCanvas = document.createElement('canvas');
        this._waterCanvas.width = gw; this._waterCanvas.height = gh;
      }
      const wc = this._waterCanvas.getContext('2d');
      wc.clearRect(0, 0, gw, gh);
      const lightAt = (tx, ty) => (this.isOpenSky(tx, ty) ? Math.max(MIN_BRIGHTNESS, this.lightFactorAt(tx, ty, true)) : 1);
      const shown = this.drawParticleWater(wc, sim, particlePos, startX, startY, cols, rows, PER, lightAt);
      if (!shown) {
        this._waterShown = null;
        return;
      }
      const x0 = Math.round(camera.worldToScreenX(startX * TILE_SIZE));
      const y0 = Math.round(camera.worldToScreenY(startY * TILE_SIZE));
      const x1 = Math.round(camera.worldToScreenX((endX + 1) * TILE_SIZE));
      const y1 = Math.round(camera.worldToScreenY((endY + 1) * TILE_SIZE));
      waterPerf.time('renderCanvasBlit', () => {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._waterCanvas, x0, y0, x1 - x0, y1 - y0);
        ctx.restore();
      });
      this._waterShown = { x0, y0, x1, y1 };
    } finally {
      waterPerf.endRender();
    }
  }

  // Water rendering: 8x8 water pixels per block (each 2x2 texture pixels);
  // Draws both resting block water (Terraria-style) and moving particles seamlessly.
  drawParticleWater(wc, sim, pos, startX, startY, cols, rows, per, lightAt) {
    const WPX = 8, sc = per / WPX;
    const GW = cols * WPX, GH = rows * WPX;
    if (!this._pGrid || this._pGrid.length !== GW * GH) {
      this._pGrid = new Uint8Array(GW * GH);
      this._pTmp = new Uint8Array(GW * GH);
      this._pTops = new Float32Array(GW);
      this._pFill = new Float32Array(GW);
      this._pSmooth = new Float32Array(GW);
      this._pCanvas = document.createElement('canvas');
      this._pCanvas.width = GW; this._pCanvas.height = GH;
      this._pImg = this._pCanvas.getContext('2d').createImageData(GW, GH);
      this._pImg32 = new Uint32Array(this._pImg.data.buffer);
      this._pActiveBBox = null;
    }
    const grid = this._pGrid;
    const d32 = this._pImg32;

    // Fast clear only of the previous active water area
    if (this._pActiveBBox) {
      const { x0, x1, y0, y1 } = this._pActiveBBox;
      for (let y = y0; y <= y1; y++) {
        const rowOffset = y * GW;
        grid.fill(0, rowOffset + x0, rowOffset + x1 + 1);
        d32.fill(0, rowOffset + x0, rowOffset + x1 + 1);
      }
    }

    let minGx = GW, maxGx = -1, minGy = GH, maxGy = -1;
    let visibleParticles = 0;
    const minPx = startX - 1, maxPx = startX + cols + 1;
    const minPy = startY - 1, maxPy = startY + rows + 1;

    waterPerf.time('renderParticleSplat', () => {
      // 1. Fill from resting block water (seamless across all chunks, 0ms physics)
      const cs = sim.cs, h = sim.h;
      for (let tx = 0; tx < cols; tx++) {
        const bx = startX + tx;
        const slot = sim.slotAt(bx);
        if (!slot) continue;
        const baseIdx = bx - Math.floor(bx / cs) * cs;
        const mass = slot.mass;
        const gx = tx * WPX;
        for (let ty = 0; ty < rows; ty++) {
          const by = startY + ty;
          if (by < 0 || by >= h) continue;
          const m = mass[by * cs + baseIdx];
          if (m <= 0.01) continue;
          const waterH = m >= 0.99 ? WPX : Math.max(1, Math.min(WPX, Math.round(m * WPX)));
          const gyStart = ty * WPX + (WPX - waterH);
          const gyEnd = ty * WPX + WPX - 1;
          if (gx < minGx) minGx = gx;
          if (gx + WPX - 1 > maxGx) maxGx = gx + WPX - 1;
          if (gyStart < minGy) minGy = gyStart;
          if (gyEnd > maxGy) maxGy = gyEnd;
          for (let gy = gyStart; gy <= gyEnd; gy++) {
            const off = gy * GW + gx;
            grid[off] = 1; grid[off + 1] = 1; grid[off + 2] = 1; grid[off + 3] = 1;
            grid[off + 4] = 1; grid[off + 5] = 1; grid[off + 6] = 1; grid[off + 7] = 1;
          }
        }
      }

      // 2. Splat moving particles (buckets, waterfalls, splashes)
      if (pos && pos.length) {
        for (let p = 0; p < pos.length; p += 2) {
          const px = pos[p], py = pos[p + 1];
          if (px < minPx || px > maxPx || py < minPy || py > maxPy) continue;
          visibleParticles++;
          const gx = Math.floor((px - startX) * WPX), gy = Math.floor((py - startY) * WPX);
          if (gx < minGx) minGx = gx;
          if (gx > maxGx) maxGx = gx;
          if (gy < minGy) minGy = gy;
          if (gy > maxGy) maxGy = gy;
          for (let s = 0; s < SPLAT_LEN; s++) {
            const x = gx + SPLAT_DX[s], y = gy + SPLAT_DY[s];
            if (x >= 0 && y >= 0 && x < GW && y < GH) grid[y * GW + x] = 1;
          }
        }
      }
    });

    waterPerf.setCounts({
      visibleParticles,
      gridW: GW,
      gridH: GH
    });

    if (maxGx < 0) {
      this._pActiveBBox = null;
      return false;
    }

    const bx0 = Math.max(0, minGx - 1);
    const bx1 = Math.min(GW - 1, maxGx + 1);
    const by0 = Math.max(0, minGy - 1);
    const by1 = Math.min(GH - 1, maxGy + 1);
    this._pActiveBBox = { x0: bx0, x1: bx1, y0: by0, y1: by1 };

    const solid = this._pSolid && this._pSolid.length === cols * rows ? this._pSolid : (this._pSolid = new Uint8Array(cols * rows));
    const blockLight = this._pBlockLight && this._pBlockLight.length === cols * rows ? this._pBlockLight : (this._pBlockLight = new Float32Array(cols * rows));

    // Precompute block solid and lighting only for intersecting blocks in the bounding box
    waterPerf.time('renderSolidLight', () => {
      const btx0 = bx0 >> 3, btx1 = Math.min(cols - 1, bx1 >> 3);
      const bty0 = by0 >> 3, bty1 = Math.min(rows - 1, by1 >> 3);
      for (let j = bty0; j <= bty1; j++) {
        const rowOffset = j * cols;
        for (let i = btx0; i <= btx1; i++) {
          solid[rowOffset + i] = sim.closed(startX + i, startY + j) ? 1 : 0;
          blockLight[rowOffset + i] = lightAt(startX + i, startY + j);
        }
      }
    });

    // Keep water out of blocks; fill one-pixel holes, drop one-pixel bumps; ensure flush fill against solid blocks.
    const tmp = this._pTmp;
    waterPerf.time('renderMorphology', () => {
      for (let y = by0; y <= by1; y++) {
        const rowSolid = (y >> 3) * cols;
        const rowOffset = y * GW;
        const belowY = y + 1;
        const belowSolidRow = belowY < GH ? (belowY >> 3) * cols : -1;
        for (let x = bx0; x <= bx1; x++) {
          const colBlock = x >> 3;
          const k = rowOffset + x;
          if (solid[rowSolid + colBlock] === 1) { tmp[k] = 0; continue; }
          const wallBelow = belowSolidRow >= 0 && solid[belowSolidRow + colBlock] === 1;
          // If resting right on the solid floor with water above it, fill flush against the ground
          if (wallBelow && y > 0 && grid[k - GW] === 1) { tmp[k] = 1; continue; }
          if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) { tmp[k] = grid[k]; continue; }
          const gk = grid[k];
          const gLeft = grid[k - 1], gUp = grid[k - GW];
          if (gk === 1) {
            const n = gLeft + grid[k + 1] + gUp + grid[k + GW];
            if (n > 1) {
              tmp[k] = 1;
            } else {
              const wallTouch = wallBelow || (x > 0 && solid[rowSolid + ((x - 1) >> 3)] === 1) || (x + 1 < GW && solid[rowSolid + ((x + 1) >> 3)] === 1);
              tmp[k] = (n >= 1 && wallTouch) ? 1 : 0;
            }
          } else {
            // Gap fill: needs at least 3 neighbors (requires at least one of left or up to be 1)
            if (gLeft + gUp === 0) {
              tmp[k] = 0;
            } else {
              const n = gLeft + grid[k + 1] + gUp + grid[k + GW];
              tmp[k] = n >= 3 ? 1 : 0;
            }
          }
        }
      }

      for (let y = by0; y <= by1; y++) {
        const rowOffset = y * GW;
        for (let x = bx0; x <= bx1; x++) grid[rowOffset + x] = tmp[rowOffset + x];
      }
    });

    // Each column's surface (first water pixel with open air above), gaps bridged, smoothed.
    const tops = this._pTops, filled = this._pFill, smooth = this._pSmooth;
    waterPerf.time('renderSurfaceDetect', () => {
      for (let x = bx0; x <= bx1; x++) {
        tops[x] = NaN;
        let capped = false;
        const colBlock = x >> 3;
        for (let y = by0; y <= by1; y++) {
          if (solid[(y >> 3) * cols + colBlock] === 1) { capped = true; continue; }
          if (grid[y * GW + x]) { if (!capped) tops[x] = y; break; }
          capped = false;
        }
      }

      let prev = -1;
      for (let x = bx0; x <= bx1 + 1; x++) {
        if (x <= bx1 && Number.isNaN(tops[x])) continue;
        for (let g = prev + 1; g < x; g++) {
          filled[g] = prev < bx0 ? (x <= bx1 ? tops[x] : NaN) : x > bx1 ? tops[prev] : tops[prev] + (tops[x] - tops[prev]) * (g - prev) / (x - prev);
        }
        if (x <= bx1) filled[x] = tops[x];
        prev = x;
      }
    });

    // Fast sliding-window surface smoothing (O(N) instead of O(N * window))
    const SM = 2 * WPX, DEPTH = Math.round(7.5 * WPX);
    waterPerf.time('renderSurfaceSmooth', () => {
      let winSum = 0, winCount = 0;
      const initRight = Math.min(bx1, bx0 + SM);
      for (let k = Math.max(bx0, bx0 - SM); k <= initRight; k++) {
        if (!Number.isNaN(filled[k])) { winSum += filled[k]; winCount++; }
      }
      smooth[bx0] = winCount ? winSum / winCount : NaN;

      for (let x = bx0 + 1; x <= bx1; x++) {
        const addIdx = x + SM;
        if (addIdx <= bx1 && !Number.isNaN(filled[addIdx])) { winSum += filled[addIdx]; winCount++; }
        const subIdx = x - SM - 1;
        if (subIdx >= bx0 && !Number.isNaN(filled[subIdx])) { winSum -= filled[subIdx]; winCount--; }
        smooth[x] = winCount ? winSum / winCount : NaN;
      }
    });

    // Precompute color LUT
    if (!this._pColorLut || this._pColorLut.length !== DEPTH + 1) {
      this._pColorLut = new Uint32Array(DEPTH + 1);
      this._pColorRGB = new Uint8Array((DEPTH + 1) * 3);
      for (let d = 0; d <= DEPTH; d++) {
        const t = d / DEPTH;
        const r = Math.round(80 - 56 * t);
        const g = Math.round(150 - 92 * t);
        const b = Math.round(232 - 104 * t);
        this._pColorLut[d] = (225 << 24) | (b << 16) | (g << 8) | r;
        this._pColorRGB[d * 3] = r;
        this._pColorRGB[d * 3 + 1] = g;
        this._pColorRGB[d * 3 + 2] = b;
      }
    }
    const colorLut = this._pColorLut;
    const colorRGB = this._pColorRGB;

    // Fast 32-bit pixel rendering inside bounding box with LUT & dirty rect blit
    let activePixels = 0;
    waterPerf.time('renderPixelShading', () => {
      for (let y = by0; y <= by1; y++) {
        const rowOffset = y * GW;
        const bRow = (y >> 3) * cols;
        for (let x = bx0; x <= bx1; x++) {
          const k = rowOffset + x;
          if (!grid[k]) continue;
          activePixels++;
          const light = blockLight[bRow + (x >> 3)];
          const sm = smooth[x];
          const d = Number.isNaN(sm) ? (DEPTH >> 1) : ((y - sm) | 0);
          const lutIdx = d <= 0 ? 0 : d >= DEPTH ? DEPTH : d;
          if (light >= 0.99) {
            d32[k] = colorLut[lutIdx];
          } else {
            const base = lutIdx * 3;
            const lr = (colorRGB[base] * light) | 0;
            const lg = (colorRGB[base + 1] * light) | 0;
            const lb = (colorRGB[base + 2] * light) | 0;
            d32[k] = (225 << 24) | (lb << 16) | (lg << 8) | lr;
          }
        }
      }

      const dirtyW = bx1 - bx0 + 1, dirtyH = by1 - by0 + 1;
      const pctx = this._pCanvas.getContext('2d');
      pctx.putImageData(this._pImg, 0, 0, bx0, by0, dirtyW, dirtyH);
      wc.imageSmoothingEnabled = false;
      wc.drawImage(this._pCanvas, bx0, by0, dirtyW, dirtyH, bx0 * sc, by0 * sc, dirtyW * sc, dirtyH * sc);
    });

    waterPerf.setCounts({ activeWaterPixels: activePixels });
    return true;
  }

  // Water in front of the players and items (they look submerged): the same water image,
  // fainter, over just their pixels (the caller draws with source-atop).
  drawWaterOver(rects) {
    const shown = this._waterShown;
    if (!shown || !this._waterCanvas) return;
    const { ctx, camera } = this;
    // Each one separately, darkened by the light where it is (the water image is drawn at
    // full brightness underground, where the light overlay darkens it later, but these are
    // drawn after that overlay).
    for (const [rx, ry, rw, rh] of rects) {
      const light = this.lightFactorAt(Math.floor((rx + rw / 2) / TILE_SIZE), Math.floor((ry + rh / 2) / TILE_SIZE), false);
      ctx.save();
      ctx.beginPath();
      ctx.rect(camera.worldToScreenX(rx), camera.worldToScreenY(ry), rw * camera.zoom, rh * camera.zoom);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 0.6;
      if (light < 1) ctx.filter = `brightness(${Math.max(MIN_BRIGHTNESS, light).toFixed(2)})`;
      ctx.drawImage(this._waterCanvas, shown.x0, shown.y0, shown.x1 - shown.x0, shown.y1 - shown.y0);
      ctx.restore();
    }
  }


  // Where a stream lands in water: churning foam on the surface, droplets thrown up and
  // bubbles rising back up through the pool beneath.
  drawSplashes() {
    const ctx = this.ctx;
    const t = gameClock.seconds();
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
    const t = gameClock.seconds();
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
    const t = gameClock.seconds();
    const dir = Math.tanh(Math.sin(t * 0.021 + 0.7) * 4);
    const strength = this.windStrength(t - tileX / WIND_SPEED);
    const ripple = 0.65 + 0.35 * Math.sin(t * 1.9 - tileX * 0.35 + tileY * 0.45);
    return Math.round(dir * strength * ripple * LEAF_MAX_SWAY * size / 16);
  }

  // How far (texels) a trunk in column tileX leans at TRUNK_REF_HEIGHT: slow and stiff,
  // following the same travelling gusts as the leaves above it.
  trunkSwayAt(tileX) {
    const t = gameClock.seconds();
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
      if (!this.registry.get(cell.id)?.trunk || cell.meta?.axis === 'x') break;
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
    // A variant texture (bush_2) tints like its block (bush).
    const tinted = BIOME_TINTED.has(id) || this.registry?.get(id.replace(/_\d+$/, ''))?.biomeTint;
    if (!texture || !(tinted || biomeHasLeafTint(id))) return texture;
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
    const [r, g, b] = this.registry.get(colorId)?.leaves ? leafColorAt(tileX, seed, colorId, base) : grassColorAt(tileX, seed);
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
    for (const p of primed) {
      const texture = this.textures[p.blockId || 'explosive'] || this.textures['explosive'];
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

  // Pixel fire in a lit furnace's mouth (texels 4-11 across, rows 5-11), plus glowing
  // embers in the ash slot below. Flickers at about 6 frames a second, like the textures.
  drawFurnaceFire(tileX, sx, sy, size) {
    const { ctx } = this;
    const px = size / 16;
    const frame = Math.floor(performance.now() / 170);
    const hash = n => { n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
    const RAMP = ['#7a1d0e', '#c2381a', '#f06a1c', '#ffa62b', '#ffd85a', '#fff6c4'];
    ctx.save();
    for (let x = 4; x <= 11; x++) {
      // Taller in the middle, each column flickering on its own.
      const centre = 1 - Math.abs(x - 7.5) / 4.5;
      const flick = hash(frame * 31 + x * 7 + tileX * 131);
      const height = 2.5 + centre * 3.5 + flick * 2;
      const top = x >= 6 && x <= 9 ? 5 : 6; // the arched mouth
      for (let y = 11; y >= top; y--) {
        const up = 11 - y;
        if (up >= height) break;
        const heat = 1 - up / height + (hash(frame * 17 + x * 3 + y * 11 + tileX) - 0.5) * 0.35;
        const i = Math.max(0, Math.min(RAMP.length - 1, Math.floor(heat * centre * 1.2 * RAMP.length + 0.5)));
        ctx.globalAlpha = up >= height - 1 ? 0.75 : 1;
        ctx.fillStyle = RAMP[i];
        ctx.fillRect(Math.floor(sx + x * px), Math.floor(sy + y * px), Math.ceil(px), Math.ceil(px));
      }
    }
    // Embers in the ash slot.
    for (let x = 5; x <= 10; x++) {
      const e = hash(frame * 5 + x * 13 + tileX * 7);
      if (e < 0.35) continue;
      ctx.globalAlpha = 1;
      ctx.fillStyle = e > 0.85 ? '#ffa62b' : e > 0.6 ? '#f06a1c' : '#9a2a12';
      ctx.fillRect(Math.floor(sx + x * px), Math.floor(sy + 14 * px), Math.ceil(px), Math.ceil(px));
    }
    // Warm glow over the face.
    ctx.globalAlpha = 0.08 + hash(frame + tileX) * 0.05;
    ctx.fillStyle = '#ff8a2a';
    ctx.fillRect(sx, sy, size, size);
    ctx.restore();
  }

  drawBlock(tileX, tileY, type, meta) {
    const { ctx, camera, world } = this;
    ctx.imageSmoothingEnabled = false;
    const sx = Math.round(camera.worldToScreenX(tileX * TILE_SIZE));
    let sy = Math.round(camera.worldToScreenY(tileY * TILE_SIZE));
    const size = Math.round(TILE_SIZE * camera.zoom);
    // Falling blocks slide down from the cell above rather than jumping a whole block.
    if (meta?.fellAt) {
      const t = Math.max(0, (gameClock.now() - meta.fellAt) / (meta.slideMs || FALL_SLIDE_MS));
      if (t < 1) sy -= Math.round((1 - t) * size);
    }
    
    const isLightSource = type.lightLevel > 0;
    const finalLightFactor = !isLightSource && (!type.solid || (type.shape && type.shape !== 'full')) && this.isOpenSky(tileX, tileY)
      ? this.lightFactorAt(tileX, tileY, true)
      : 1.0;

    // Blocks with several looks (bush sizes, shells...) pick a texture from their meta.
    const textureId = type.variants ? `${type.id}_${meta?.[type.variants.key] ?? type.variants.count}` : type.id;
    if (type.id === 'double_slab') {
      const shade = meta?.layer === 'bg' ? finalLightFactor * BACKGROUND_WALL_SHADE : finalLightFactor;
      const half = Math.floor(size / 2);
      // A grass slab under another slab is covered, so it shows its bare soil.
      // Grass slab halves show their bare soil; grass goes on as an overlay like other grass.
      const halfId = (id) => this.registry.get(id)?.grassy ? bareIdOf(id) : id;
      const bottomId = halfId(meta?.bottom);
      const topId = halfId(meta?.top);
      const bottom = bottomId && this.textures[bottomId];
      const top = topId && this.textures[topId];
      // Slab textures hold the slab in their lower half: the top one is drawn shifted up.
      if (isTextureReady(bottom)) this.drawBlockTexture(this.biomeTexture(bottomId, bottom, tileX), sx, sy, size, shade);
      if (isTextureReady(top)) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx, sy, size, half);
        ctx.clip();
        this.drawBlockTexture(this.biomeTexture(topId, top, tileX), sx, sy - half, size, shade);
        ctx.restore();
      }
      if (isGrassyCell({ id: type.id, meta }) && polishOn('connectedGrass')) {
        const overlayId = this.grassOverlay(tileX, tileY, meta);
        if (overlayId) this.drawBlockTexture(this.biomeTexture(overlayId, this.textures[overlayId], tileX), sx, sy, size, shade);
      }
      return;
    }
    // Grass blocks are drawn as their bare soil with a grass overlay on top.
    if (type.grassy && meta?.layer !== 'bg' && polishOn('connectedGrass')) {
      const soilId = bareIdOf(type.id, meta);
      const soil = this.textures[soilId];
      if (isTextureReady(soil)) {
        const flip = type.shape === 'stairs' && meta?.orient === 'left';
        const shiftUp = type.shape === 'slab' && meta?.slabPos === 'top' ? Math.floor(size / 2) : 0;
        ctx.save();
        ctx.translate(flip ? sx + size : sx, sy - shiftUp);
        if (flip) ctx.scale(-1, 1);
        this.drawBlockTexture(soil, 0, 0, size, finalLightFactor);
        ctx.restore();
        const overlayId = this.grassOverlay(tileX, tileY, meta);
        if (overlayId) this.drawBlockTexture(this.biomeTexture(overlayId, this.textures[overlayId], tileX), sx, sy, size, finalLightFactor);
        return;
      }
    }
    let texture = this.textures[textureId] || this.textures[type.id] || this.missingTextureFor(type);
    texture = this.biomeTexture(textureId, texture, tileX);
    if (type.id === 'water') {
      return;
    }
    if ((type.id === 'rock' || type.id === 'pebble') && texture) {
      this.drawRock(texture, sx, sy, size, meta, finalLightFactor);
      return;
    }
    if (type.leaves && texture) {
      const isBg = meta?.layer === 'bg';
      const leafLight = isBg ? finalLightFactor * BACKGROUND_WALL_SHADE : finalLightFactor;
      const lx = sx + this.leafSwayOffset(tileX, tileY, size);
      // Solid shaded foliage behind the holey leaf texture, so canopies don't look see-through.
      if (!polishOn('leaves')) {
        this.drawBlockTexture(texture, lx, sy, size, leafLight);
        return;
      }
      const [r, g, b] = this.averageColor(texture);
      const k = 0.62 * Math.max(MIN_BRIGHTNESS, Math.min(1, leafLight));
      ctx.fillStyle = `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
      // The backing stops short of open sides, so the canopy's outline stays ragged.
      const leafy = (x, y) => {
        const t = world.inBounds(x, y) ? world.getBlockType(x, y) : null;
        const c = world.getCell(x, y);
        return !!t && (t.solid || !!t.leaves || (c?.meta?.bgId && this.registry.get(c.meta.bgId)?.leaves) || t.id.endsWith('_log'));
      };
      const inset = Math.round(size * 4 / 16);
      const l0 = leafy(tileX - 1, tileY) ? 0 : inset, r0 = leafy(tileX + 1, tileY) ? 0 : inset;
      const t0 = leafy(tileX, tileY - 1) ? 0 : inset, b0 = leafy(tileX, tileY + 1) ? 0 : inset;
      ctx.fillRect(lx + l0, sy + t0, size - l0 - r0, size - t0 - b0);
      this.drawBlockTexture(texture, lx, sy, size, leafLight);
      return;
    }
    if (type.windSway && texture && meta?.layer !== 'bg') {
      this.drawSwaying(texture, sx, sy, size, finalLightFactor, this.windSwayAt(tileX), type.windSway);
      return;
    }
    if (texture && meta?.axis !== 'x' && meta?.layer !== 'bg' && type.trunk) {
      this.drawTrunk(texture, tileX, tileY, sx, sy, size, finalLightFactor);
      // Inside the crown: leaves in front of the trunk.
      const leafId = keptLeafCover(world, tileX, tileY);
      const leafTexture = leafId && this.biomeTexture(leafId, this.textures[leafId], tileX);
      if (leafTexture) this.drawBlockTexture(leafTexture, sx + this.leafSwayOffset(tileX, tileY, size), sy, size, finalLightFactor);
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
    
    if (type.climbable && texture) {
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
    if (type.kind === 'chest' && (meta?.chestType === 'left' || meta?.chestType === 'right')) {
      chestTexture = this.textures[`${type.id}_${meta.chestType}`];
    }

    // An open trapdoor stands on end against one side of its cell.
    if (type.kind === 'trapdoor' && meta?.open && texture) {
      const half = Math.floor(size * (type.thickness ?? 8) / 16);
      ctx.save();
      // Rotate the hatch (drawn along the bottom of its texture) a quarter turn.
      if (meta.hinge === 'left') {
        ctx.translate(sx + half, sy);
        ctx.rotate(Math.PI / 2);
        ctx.translate(0, -size + half);
      } else {
        ctx.translate(sx + size - half, sy + size);
        ctx.rotate(-Math.PI / 2);
        ctx.translate(0, -size + half);
      }
      this.drawBlockTexture(texture, 0, 0, size, finalLightFactor);
      ctx.restore();
      return;
    }

    if (texture || chestTexture) {
      const drawTexture = chestTexture || texture;
      const flip = type.shape === 'stairs' && meta?.orient === 'left';
      const shiftUp = type.shape === 'slab' && meta?.slabPos === 'top' ? Math.floor(size * (16 - (type.thickness ?? 8)) / 16) : 0;
      const isBg = meta?.layer === 'bg';

      ctx.save();
      ctx.translate(flip ? sx + size : sx, sy - shiftUp);
      if (flip) ctx.scale(-1, 1);
      this.drawBlockTexture(drawTexture, 0, 0, size, isBg ? finalLightFactor * BACKGROUND_WALL_SHADE : finalLightFactor);
      ctx.restore();
      if (type.id === 'furnace' && meta?.burn > 0 && !isBg) this.drawFurnaceFire(tileX, sx, sy, size);
      return;
    }

    const isBackground = meta?.layer === 'bg' && !isLightSource;
    const c = darkenHex(type.color || '#999999', isBackground ? finalLightFactor * BACKGROUND_WALL_SHADE : finalLightFactor);

    ctx.save();
    ctx.translate(sx, sy);

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

  // Other multiplayer players: drawn exactly like the local player, by briefly pointing the
  // player drawing at them (their aim stands in for the mouse, their held item for the
  // hotbar), then a name tag above their head. Returns who was drawn.
  drawRemotePlayers() {
    const mp = typeof window !== 'undefined' ? window.multiplayer : null;
    if (!mp?.remotePlayers.size) { this.pruneNameTags([]); return []; }
    const saved = { player: this.player, input: this.input, inventory: this.inventory, getUI: this.getUI, breaker: this.breaker };
    const drawn = [];
    const { camera, ctx } = this;
    for (const rp of mp.remotePlayers.values()) {
      const sx = camera.worldToScreenX(rp.x);
      if (sx < -200 || sx > this.canvas.width + 200) continue;
      this.player = rp;
      this.input = { mouse: { x: camera.worldToScreenX(rp.aimX), y: camera.worldToScreenY(rp.aimY), leftDown: rp.mining, rightDown: false } };
      this.inventory = { getSlot: () => rp.held };
      this.getUI = () => ({ selectedIndex: 0, inventoryOpen: false });
      this.breaker = { state: { active: rp.mining }, getState: () => null };
      try {
        this.drawPlayer();
        this.drawHurtTint(rp);
      } finally {
        Object.assign(this, saved);
      }
      drawn.push(rp);
      // Blocks between you and them, centre to centre.
      const me = saved.player;
      const dist = me ? Math.hypot((rp.x + rp.width / 2) - (me.x + me.width / 2), (rp.y + rp.height / 2) - (me.y + me.height / 2)) / TILE_SIZE : 0;
      this.placeNameTag(rp, camera.worldToScreenX(rp.x + rp.width / 2), camera.worldToScreenY(rp.y), dist);
    }
    this.pruneNameTags(drawn);
    return drawn;
  }

  // Name tags are page elements (not canvas drawing) so they use the same container style as the
  // hotbar and chat, whatever the theme. (sx, sy) is the top-centre of the player in canvas pixels.
  placeNameTag(rp, sx, sy, dist = 0) {
    if (!this.nameTags) {
      this.nameTags = new Map();
      this.nameTagLayer = document.createElement('div');
      this.nameTagLayer.className = 'name-tag-layer';
      document.body.appendChild(this.nameTagLayer);
    }
    let el = this.nameTags.get(rp.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'name-tag';
      el.appendChild(document.createElement('span')).className = 'name-tag-text';
      this.nameTagLayer.appendChild(el);
      this.nameTags.set(rp.id, el);
    }
    // Crouching hides the tag. Full strength within 15 blocks, fading to nothing by 20.
    const fade = rp.crouching ? 0 : Math.max(0, Math.min(1, (NAME_TAG_FAR - dist) / (NAME_TAG_FAR - NAME_TAG_NEAR)));
    el.style.opacity = fade;
    el.style.visibility = fade > 0 ? 'visible' : 'hidden';
    if (rp.color) {
      el.style.setProperty('--tag-color', rp.color);
      el.classList.add('colored');
    } else {
      el.style.removeProperty('--tag-color');
      el.classList.remove('colored');
    }
    const label = el.firstChild;
    if (label.textContent !== rp.name) label.textContent = rp.name;
    const box = this.canvas.getBoundingClientRect();
    const px = box.left + sx * (box.width / this.canvas.width);
    const py = box.top + sy * (box.height / this.canvas.height);
    el.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px) translate(-50%, -100%)`;
  }

  pruneNameTags(drawn) {
    if (!this.nameTags?.size) return;
    const keep = new Set(drawn.map(rp => rp.id));
    for (const [id, el] of this.nameTags) {
      if (!keep.has(id)) { el.remove(); this.nameTags.delete(id); }
    }
  }

  // Red edges on the screen for a moment after you're hurt.
  drawHurtVignette() {
    const since = this.player?.hurtAt ? performance.now() - this.player.hurtAt : Infinity;
    if (since > 500) return;
    const { ctx, canvas } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const r = Math.hypot(canvas.width, canvas.height) / 2;
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, r * 0.45, canvas.width / 2, canvas.height / 2, r);
    g.addColorStop(0, 'rgba(255, 0, 0, 0)');
    g.addColorStop(1, `rgba(200, 0, 0, ${0.5 * (1 - since / 500)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // A player who just took damage flashes red.
  drawHurtTint(p) {
    const since = p?.hurtAt ? performance.now() - p.hurtAt : Infinity;
    if (since > 350) return;
    const { ctx, camera } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.55 * (1 - since / 350);
    ctx.fillStyle = '#ff2020';
    const x = camera.worldToScreenX(p.x - 10);
    const y = camera.worldToScreenY(p.y - 10);
    ctx.fillRect(x, y, (p.width + 20) * camera.zoom, (p.height + 14) * camera.zoom);
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
    
    // The player's chosen skin: an imported PNG, a built-in texture, or Steve.
    const steveSkin = player.skinImage || this.textures[player.skin] || this.textures['steve'];
    
    const headSize = 8;
    const torsoWidth = 4;
    const torsoHeight = 12;
    const armWidth = 4;
    const armHeight = 12;
    const legWidth = 4;
    const legHeight = 12;
    
    // The player is drawn at the camera's zoom like everything else (3 = normal zoom).
    const scale = camera.zoom;
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
      
      const isTool = /(_(pickaxe|axe|shovel|sword|hoe)|^stick)$/.test(textureId || '');
      const baseSize = Math.round(8 * camera.zoom);
      const itemSize = isTool ? Math.round(baseSize * 1.75) : baseSize;
      
      ctx.save();
      
      const combinedLightFactor = 1;
      ctx.globalAlpha = 1.0;
      
      if (textureId && this.textures[textureId]) {
        if (pose) {
          const handDist = pose.armTopOffset + pose.armLength - baseSize * 0.45 + 10 * this.camera.zoom / 3;
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
          const handDist = pose.armTopOffset + pose.armLength - itemSize * 0.45 + 10 * this.camera.zoom / 3;
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
    const type = registry.get(state.wall || world.getBlockId(state.x, state.y)) || registry.get(state.id);
    
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
    if (polishOn('rounding')) cornerRect(ctx, sx, sy, size, '#ffffff', 2);
    else ctx.strokeRect(sx, sy, size, size);
    
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
    
    if (!world.inBounds(tileX, tileY)) return;
    // An empty cell gets a fainter outline when the held block can go there.
    const empty = world.getBlockId(tileX, tileY) === 'air' || world.getCell(tileX, tileY)?.meta?.layer === 'bg';
    const placeable = empty && ui.canPlaceAt?.(tileX, tileY);
    if (!empty || placeable) {
      const playerCenterX = player.x + player.width / 2;
      const playerCenterY = player.y + player.height / 2;
      const dx = (tileX * TILE_SIZE + TILE_SIZE / 2) - playerCenterX;
      const dy = (tileY * TILE_SIZE + TILE_SIZE / 2) - playerCenterY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= (ui.reach ?? 5) * TILE_SIZE) {
        if (placeable) ctx.globalAlpha = 0.55;
        const sx = Math.round(camera.worldToScreenX(tileX * TILE_SIZE));
        const sy = Math.round(camera.worldToScreenY(tileY * TILE_SIZE));
        const size = Math.round(TILE_SIZE * camera.zoom);
        
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 2;
        if (polishOn('rounding')) cornerRect(ctx, sx, sy, size, '#888888', 2);
        else ctx.strokeRect(sx, sy, size, size);
        ctx.globalAlpha = 1;
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
