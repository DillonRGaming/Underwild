// Dimensions and Multi-World System for Underwild.
// Enables multiple distinct worlds (Overworld, Moon, etc.) to exist within the same save,
// each with unique terrain generators, block types, gravity/physics, atmospheres, and custom functions.

import { World } from './world.js';
import { TILE_SIZE } from './utils.js';
import { naturalHeightAt } from '../logic/terrainGen.js';

export class DimensionDefinition {
  constructor(options) {
    this.id = options.id;
    this.displayName = options.displayName || options.id;
    this.aliases = options.aliases || [];
    this.worldType = options.worldType || options.id;
    this.gravityMultiplier = options.gravityMultiplier ?? 1.0;
    this.hasClouds = options.hasClouds ?? true;
    this.hasHills = options.hasHills ?? true;
    this.starsAlwaysVisible = options.starsAlwaysVisible ?? false;
    this.skyColor = options.skyColor || null;
    this.ambientLight = options.ambientLight ?? null;
    this.seedOffset = options.seedOffset ?? 0;
    this.blocks = options.blocks || {};
    this.functions = options.functions || {};
  }
}

export const dimensionRegistry = new Map();

export function registerDimension(def) {
  const dim = def instanceof DimensionDefinition ? def : new DimensionDefinition(def);
  dimensionRegistry.set(dim.id.toLowerCase(), dim);
  for (const alias of dim.aliases) {
    dimensionRegistry.set(alias.toLowerCase(), dim);
  }
  return dim;
}

export function getDimension(nameOrId) {
  if (!nameOrId) return null;
  return dimensionRegistry.get(String(nameOrId).trim().toLowerCase()) || null;
}

export function resolveDimensionId(nameOrId) {
  const dim = getDimension(nameOrId);
  return dim ? dim.id : null;
}

export function listDimensions() {
  const unique = new Set();
  const list = [];
  for (const dim of dimensionRegistry.values()) {
    if (!unique.has(dim.id)) {
      unique.add(dim.id);
      list.push(dim);
    }
  }
  return list;
}

// Built-in dimensions:
// 1. Earth: The standard diverse natural realm
registerDimension({
  id: 'earth',
  displayName: 'Earth',
  aliases: ['overworld', 'main', 'normal', 'ground'],
  worldType: 'regular',
  gravityMultiplier: 1.0,
  hasClouds: true,
  hasHills: true,
  starsAlwaysVisible: false,
  seedOffset: 0,
  blocks: {
    surface: 'grass',
    sub: 'dirt',
    deep: 'stone'
  },
  functions: {
    canSpreadGrass: true,
    canHoldWater: true
  }
});

// 2. Moon: A silent lunar realm made entirely of stone, low gravity, and starry space sky
registerDimension({
  id: 'moon',
  displayName: 'Moon',
  aliases: ['luna', 'the_moon', 'the moon', 'space'],
  worldType: 'moon',
  gravityMultiplier: 0.2, // Low lunar gravity (1/5 Earth)
  hasClouds: false, // Vacuum / no clouds
  hasHills: false, // No earthly hills
  starsAlwaysVisible: true, // Stars always shine in the black sky
  skyColor: [0, 0, 0], // Pure black space sky
  ambientLight: 0.25,
  seedOffset: 7777,
  blocks: {
    surface: 'lunar_rock',
    terrain: 'lunar_rock',
    all: 'lunar_rock'
  },
  functions: {
    canSpreadGrass: false,
    canHoldWater: false,
    tick: (dt, world) => {
      // Custom dimension tick hook for the Moon
    }
  }
});

// 3. Mars: The Red Planet with rusty sands, sandstone geology, dunes, craters, and 38% gravity
registerDimension({
  id: 'mars',
  displayName: 'Mars',
  aliases: ['the_red_planet', 'red_planet', 'the red planet', 'ares'],
  worldType: 'mars',
  gravityMultiplier: 0.38, // 38% Earth gravity (~0.38g)
  hasClouds: false, // Thin atmosphere / no earth clouds
  hasHills: true, // Martian rusty dunes/ridges
  starsAlwaysVisible: false, // Visible during night, dim reddish butterscotch during day
  skyColor: [195, 115, 75], // Butterscotch / dusty salmon-orange Martian sky
  ambientLight: 0.32,
  seedOffset: 9999,
  blocks: {
    surface: 'mars_sand',
    sub: 'mars_sandstone',
    terrain: 'mars_sandstone',
    deep: 'mars_sandstone'
  },
  functions: {
    canSpreadGrass: false,
    canHoldWater: false,
    tick: (dt, world) => {
      // Custom dimension tick hook for Mars
    }
  }
});

// Find the closest safe block position for the player in the given world.
// A safe block has solid ground directly below feet, and non-solid (passable/air)
// blocks for both feet and head space.
// Gives a world a dimension's look and physics (gravity, sky, clouds...). Returns the definition.
export function applyDimension(world, id) {
  const dimDef = getDimension(id) || getDimension('earth');
  world.dimensionId = dimDef.id;
  world.dimension = dimDef;
  world.worldType = dimDef.id === 'earth' ? world.worldType || 'regular' : dimDef.worldType || dimDef.id;
  world.gravityMultiplier = dimDef.gravityMultiplier ?? 1.0;
  world.hasClouds = dimDef.hasClouds ?? true;
  world.hasHills = dimDef.hasHills ?? true;
  world.skyColor = dimDef.skyColor || null;
  world.starsAlwaysVisible = dimDef.starsAlwaysVisible || false;
  return dimDef;
}

export function isSpotSafe(world, tx, ty) {
  if (!world.inBounds(tx, ty) || !world.inBounds(tx, ty - 1) || !world.inBounds(tx, ty + 1)) {
    return false;
  }
  // Footing below: solid block to stand on
  if (!world.isSolidAt(tx, ty + 1)) return false;
  // Body space: passable
  if (world.isSolidAt(tx, ty)) return false;
  // Head space: passable
  if (world.isSolidAt(tx, ty - 1)) return false;
  return true;
}

export function findClosestSafeSpot(world, targetTileX, targetTileY = null) {
  const clampedX = Math.max(1, Math.min(world.width - 2, Math.floor(targetTileX)));

  // Helper: finds the highest safe spot in a column (surface under open sky)
  const findSurfaceSpot = (colX) => {
    if (colX < 1 || colX >= world.width - 1) return null;
    for (let y = 2; y < world.height - 2; y++) {
      if (isSpotSafe(world, colX, y)) {
        return { x: colX, y };
      }
    }
    return null;
  };

  // If no target Y was requested (e.g. dimension teleportation without explicit Y),
  // strictly prioritize the surface spot under the open sky
  if (targetTileY === null || targetTileY === undefined) {
    const directSurface = findSurfaceSpot(clampedX);
    if (directSurface) return directSurface;

    for (let r = 1; r <= 32; r++) {
      for (const dx of [r, -r]) {
        const spot = findSurfaceSpot(clampedX + dx);
        if (spot) return spot;
      }
    }

    try {
      const naturalH = naturalHeightAt(clampedX, world.seed ?? 0, world.height, world.worldType || 'regular');
      return { x: clampedX, y: Math.max(2, naturalH - 1) };
    } catch (e) {
      return { x: clampedX, y: Math.floor(world.height / 2) };
    }
  }

  const clampedY = Math.max(2, Math.min(world.height - 3, Math.floor(targetTileY)));

  let bestSpot = null;
  let bestDist = Infinity;

  // 1. Search directly in the target column across all heights
  for (let y = 2; y < world.height - 2; y++) {
    if (isSpotSafe(world, clampedX, y)) {
      const dist = Math.abs(y - clampedY);
      if (dist < bestDist) {
        bestDist = dist;
        bestSpot = { x: clampedX, y };
      }
    }
  }

  if (bestSpot) return bestSpot;

  // 2. If the column doesn't have an open safe spot, search outwards column by column
  for (let r = 1; r <= 32; r++) {
    for (const dx of [r, -r]) {
      const tx = clampedX + dx;
      if (tx < 1 || tx >= world.width - 1) continue;
      for (let y = 2; y < world.height - 2; y++) {
        if (isSpotSafe(world, tx, y)) {
          const dist = Math.hypot(dx * 1.5, y - clampedY);
          if (dist < bestDist) {
            bestDist = dist;
            bestSpot = { x: tx, y };
          }
        }
      }
    }
    if (bestSpot) return bestSpot;
  }

  // 3. Fallback: sample surface height from natural terrain generator
  try {
    const naturalH = naturalHeightAt(clampedX, world.seed ?? 0, world.height, world.worldType || 'regular');
    return { x: clampedX, y: Math.max(2, naturalH - 1) };
  } catch (e) {
    return { x: clampedX, y: clampedY };
  }
}

// Manages all dimensions in a world save session.
export class DimensionManager {
  constructor({ seed, width, height, registry, initialWorld = null, initialWorldType = 'regular' }) {
    this.baseSeed = seed || 0;
    this.width = width;
    this.height = height;
    this.registry = registry;
    this.dimensions = new Map(); // id -> World
    this.savedDimensionsData = new Map(); // id -> { worldType, seed, time, chunkData, itemEntities } from the save, until visited
    this.activeDimensionId = 'earth';

    if (initialWorld) {
      if (initialWorldType) initialWorld.worldType = initialWorldType;
      applyDimension(initialWorld, 'earth');
      initialWorld.dimensionManager = this;
      this.dimensions.set('earth', initialWorld);
    }
  }

  tick(dt) {
    for (const [dimId, dimWorld] of this.dimensions.entries()) {
      if (dimId !== this.activeDimensionId && dimWorld && !dimWorld.timeManuallySet) {
        dimWorld.time = (dimWorld.time || 0) + dt;
      }
    }
  }

  getDimensionWorld(id) {
    const norm = resolveDimensionId(id);
    return norm ? this.dimensions.get(norm) || null : null;
  }

  getOrCreateDimension(id) {
    const norm = resolveDimensionId(id);
    if (!norm) throw new Error(`Unknown dimension: ${id}`);
    const dimDef = getDimension(norm);

    if (this.dimensions.has(norm)) {
      return this.dimensions.get(norm);
    }

    const saved = this.savedDimensionsData.get(norm);
    const dimSeed = norm === 'earth' || norm === 'overworld' ? this.baseSeed : this.baseSeed + (dimDef.seedOffset || 1337);
    const world = new World(this.width, this.height, this.registry, saved?.seed ?? dimSeed);
    applyDimension(world, norm);
    world.dimensionManager = this;
    world.items = [];
    const earthWorld = this.dimensions.get('earth');
    world.time = saved?.time ?? (earthWorld ? earthWorld.time : 0);

    // Restore what was saved for this dimension: its changed chunks and its dropped items.
    if (saved) {
      for (const [cx, cells] of saved.chunkData || []) world._savedChunks.set(cx, cells);
      for (const ent of saved.itemEntities || []) {
        if (!ent.blockId) continue;
        const cx = world.chunkXFor(Math.floor(ent.x / TILE_SIZE));
        world._savedEntities.set(cx, (world._savedEntities.get(cx) || []).concat(ent));
      }
      // Once it's a live world it's saved from that, not from here.
      this.savedDimensionsData.delete(norm);
    }

    this.dimensions.set(norm, world);
    return world;
  }
}
