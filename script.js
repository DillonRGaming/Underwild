import { Engine } from './src/core/engine.js';
import { Input } from './src/core/input.js';
import { Renderer } from './src/core/renderer.js';
import { World } from './src/core/world.js';
import { Camera } from './src/core/camera.js';
import { BlockRegistry } from './src/core/registry.js';
import { Player } from './src/entities/player.js';
import { TILE_SIZE, rectsOverlap } from './src/core/utils.js';
import { registerAllBlocks } from './blocks/index.js';
import { generateTerrain } from './src/logic/terrainGen.js';
import { Placer } from './src/logic/placing.js';
import { Breaker } from './src/logic/breaking.js';
import { Clouds } from './src/logic/clouds.js';

const REACH_TILES = 5;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = Math.floor(window.devicePixelRatio * canvas.clientWidth);
  canvas.height = Math.floor(window.devicePixelRatio * canvas.clientHeight);
}
function ensureCSSSize() {
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
}
ensureCSSSize();
resizeCanvas();
window.addEventListener('resize', () => {
  ensureCSSSize();
  resizeCanvas();
});

const input = new Input(canvas);
input.mouse.x = canvas.width / 2;
input.mouse.y = canvas.height / 2;

const camera = new Camera();
const registry = new BlockRegistry();
registerAllBlocks(registry);

const WORLD_WIDTH = 256;
const WORLD_HEIGHT = 128;
const world = new World(WORLD_WIDTH, WORLD_HEIGHT, registry);
const seed = Math.floor(Math.random() * 1000000);
generateTerrain(world, { seed });

// Item entity system
const items = [];

// Global game speed multiplier (1 = normal). /tick sets this.
let gameSpeed = 1;

function findSurfaceY(tileX) {
  // Find the first solid block from the top that's not water
  for (let y = 0; y < world.height; y++) {
    const id = world.getBlockId(tileX, y);
    // Return the y-coordinate of the surface block (grass or sand)
    if (id === 'grass' || id === 'sand') {
      return y;
    }
  }
  // Fallback if no surface block found
  return Math.floor(world.height * 0.6);
}

/**
 * findDropY(xPixel, yPixel)
 * Given a pixel position, find the pixel Y that represents the center of
 * the top-most tile where the dropped item should settle (i.e. first solid
 * tile below). This ensures drops obey gravity and land on top of blocks.
 * Also ensures items don't get stuck inside blocks by checking if the item
 * would be inside a solid block and pushing it out.
 */
function findDropY(xPixel, yPixel) {
  const tileX = Math.floor(xPixel / TILE_SIZE);
  let tileY = Math.floor(yPixel / TILE_SIZE);

  if (!world.inBounds(tileX, tileY)) {
    // clamp to bounds
    tileY = Math.max(0, Math.min(world.height - 1, tileY));
  }

  // Check if the item would be inside a solid block and push it out
  const currentType = world.getBlockType(tileX, tileY);
  if (currentType && currentType.solid) {
    // Item is inside a solid block, push it up until we find an empty space
    while (tileY > 0) {
      const checkType = world.getBlockType(tileX, tileY - 1);
      if (!checkType || !checkType.solid) break;
      tileY--;
    }
  }

  // Move down until we find a tile that has a solid block beneath it
  // (i.e., the item should rest on top of a solid block)
  while (tileY < world.height - 1) {
    const belowType = world.getBlockType(tileX, tileY + 1);
    if (belowType && belowType.solid) break;
    tileY++;
  }

  // Settle at center of found tile
  return (tileY + 0.5) * TILE_SIZE;
}

// Spawn player at 0,0 coordinates on the surface
const spawnTileX = 0;
const groundY = findSurfaceY(spawnTileX);
const spawnX = TILE_SIZE * spawnTileX;
const spawnY = (groundY - 2) * TILE_SIZE;
const player = new Player(world, registry, spawnX, spawnY);
player.onGround = false;

world.time = 30;

class Inventory {
  constructor(registry) {
    this.registry = registry;
    this.HOTBAR_SIZE = 9;
    this.TOTAL_SLOTS = 9 + 27;
    this.maxStack = 64;
    this.slots = Array.from({ length: this.TOTAL_SLOTS }, () => null);
  }
  
  getSlot(i) { 
    return this.slots[i]; 
  }
  
  setSlot(i, stack) { 
    this.slots[i] = stack; 
  }
  
  takeSlot(i) { 
    const s = this.slots[i]; 
    this.slots[i] = null; 
    return s; 
  }
  
  canMerge(a, b) {
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.type === 'block') return a.blockId === b.blockId;
    if (a.type === 'item') return a.itemId === b.itemId;
    return false;
  }
  
  addBlock(blockId, count = 1) {
    // First try to merge with existing stacks
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.type === 'block' && s.blockId === blockId && s.count < (s.maxStack ?? 64)) {
        const room = (s.maxStack ?? 64) - s.count;
        const take = Math.min(room, count);
        s.count += take;
        count -= take;
      }
    }
    
    // Then try to add to empty slots
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(64, count);
        const block = this.registry.get(blockId);
        this.slots[i] = { 
          type: 'block', 
          blockId, 
          displayName: block?.displayName || blockId, 
          count: take, 
          maxStack: block?.maxStack ?? 64 
        };
        count -= take;
      }
    }
    
    return count;
  }
  
  addItem(itemId, count = 1) {
    // First try to merge with existing stacks
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.type === 'item' && s.itemId === itemId && s.count < (s.maxStack ?? 64)) {
        const room = (s.maxStack ?? 64) - s.count;
        const take = Math.min(room, count);
        s.count += take;
        count -= take;
      }
    }
    
    // Then try to add to empty slots
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(64, count);
        this.slots[i] = { 
          type: 'item', 
          itemId, 
          displayName: itemId === 'stick' ? 'Stick' : itemId, 
          count: take, 
          maxStack: 64 
        };
        count -= take;
      }
    }
    
    return count;
  }
  
  getAllBlocks() {
    const blocks = [];
    for (const [id, block] of this.registry.entries()) {
      if (id !== 'air') {
        blocks.push({
          type: 'block',
          blockId: id,
          displayName: block.displayName || id,
          count: 1,
          maxStack: block.maxStack ?? 64
        });
      }
    }
    return blocks;
  }
  
  removeItems(type, id, count) {
    let remaining = count;
    
    // Try to remove from existing stacks
    for (let i = 0; i < this.TOTAL_SLOTS && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.type === type && 
          ((type === 'block' && s.blockId === id) || (type === 'item' && s.itemId === id))) {
        const take = Math.min(s.count, remaining);
        s.count -= take;
        remaining -= take;
        
        if (s.count <= 0) {
          this.slots[i] = null;
        }
      }
    }
    
    return remaining;
  }
}
const inventory = new Inventory(registry);

let inventoryOpen = false;
let openContainer = null;
let draggingStack = null;
let selectedIndex = 0;
let creativeMode = false;
let noClipMode = false;
let textInputMode = false;
let textInputValue = '';

// Make textInputMode globally accessible
if (typeof window !== 'undefined') {
  window.textInputMode = textInputMode;
}

const placer = new Placer(registry);
const breaker = new Breaker(registry);
const clouds = new Clouds(world);

const inventoryCraftGrid = Array.from({ length: 4 }, () => null);
const craftGrid = Array.from({ length: 9 }, () => null);
let craftOutput = null;
let craftMatch = null;

function processTextInputCommand(command) {
  if (!command.trim()) return;

  const trimmed = command.trim();
  // Slash commands
  if (trimmed.startsWith('/')) {
    const parts = trimmed.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === 'give') {
      const id = parts[1];
      const amount = parts.length > 2 ? parseInt(parts[2], 10) : 1;
      if (!id) { console.log('Usage: /give <blockId|itemId> <amount>'); return; }
      if (isNaN(amount) || amount <= 0) { console.log('Invalid amount'); return; }

      const block = registry.get(id);
      if (block) {
        const leftover = inventory.addBlock(id, amount);
        console.log(`Gave ${amount - leftover} ${id} to player (${leftover} leftover)`);
      } else {
        // treat as item
        if (id === 'stick') {
          const leftover = inventory.addItem('stick', amount);
          console.log(`Gave ${amount - leftover} stick(s) to player (${leftover} leftover)`);
        } else {
          console.log(`Unknown block or item: ${id}`);
        }
      }
      return;
    }

    if (cmd === 'tick') {
      const val = parts.length > 1 ? parseFloat(parts[1]) : NaN;
      if (isNaN(val) || val <= 0) {
        console.log('Usage: /tick <speed>  (speed > 0) — higher makes world updates faster');
        return;
      }
      gameSpeed = val;
      console.log(`Game speed set to ${gameSpeed}x`);
      return;
    }

    if (cmd === 'tp') {
      const tx = parts.length > 1 ? Number(parts[1]) : NaN;
      const ty = parts.length > 2 ? Number(parts[2]) : NaN;
      if (Number.isNaN(tx) || Number.isNaN(ty)) {
        console.log('Usage: /tp <x> <y>');
        return;
      }
      // teleport player (tile coords)
      player.x = tx * TILE_SIZE;
      player.y = ty * TILE_SIZE;
      // clear velocities
      player.vx = 0;
      player.vy = 0;
      console.log(`Teleported player to ${tx}, ${ty}`);
      return;
    }

    console.log('Unknown command:', cmd);
    return;
  }

  // Legacy behavior (give via typing without slash)
  // Parse the command: "blockId count" or just "blockId" (default count 1)
  const parts = trimmed.split(' ');
  const blockId = parts[0];
  const count = parts.length > 1 ? parseInt(parts[1]) : 1;

  // Validate count
  if (isNaN(count) || count <= 0) {
    console.log('Invalid count specified');
    return;
  }

  const block = registry.get(blockId);
  if (block) {
    const leftover = inventory.addBlock(blockId, count);
    if (leftover > 0) {
      console.log(`Added ${count - leftover} of ${blockId} to inventory. ${leftover} could not be added (inventory full)`);
    } else {
      console.log(`Added ${count} of ${blockId} to inventory`);
    }
  } else {
    if (blockId === 'stick') {
      const leftover = inventory.addItem('stick', count);
      if (leftover > 0) {
        console.log(`Added ${count - leftover} of ${blockId} to inventory. ${leftover} could not be added (inventory full)`);
      } else {
        console.log(`Added ${count} of ${blockId} to inventory`);
      }
    } else {
      console.log(`Unknown block or item: ${blockId}`);
    }
  }
}

const recipes = [
  { type: 'shapeless', in: { oak_log: 1 }, out: { blockId: 'oak_planks', count: 4 } },
  { type: 'shapeless', in: { birch_log: 1 }, out: { blockId: 'birch_planks', count: 4 } },
  { type: 'shapeless', in: { spruce_log: 1 }, out: { blockId: 'spruce_planks', count: 4 } },
  
  { type: 'shaped', shape: ['pp', 'pp'], ingredients: { p: 'oak_planks' }, out: { blockId: 'crafting_table', count: 1 } },
  { type: 'shaped', shape: ['pp', 'pp'], ingredients: { p: 'birch_planks' }, out: { blockId: 'crafting_table', count: 1 } },
  { type: 'shaped', shape: ['pp', 'pp'], ingredients: { p: 'spruce_planks' }, out: { blockId: 'crafting_table', count: 1 } },
  
  { type: 'shaped', shape: ['p', 'p'], ingredients: { p: 'oak_planks' }, out: { itemId: 'stick', count: 4 } },
  { type: 'shaped', shape: ['p', 'p'], ingredients: { p: 'birch_planks' }, out: { itemId: 'stick', count: 4 } },
  { type: 'shaped', shape: ['p', 'p'], ingredients: { p: 'spruce_planks' }, out: { itemId: 'stick', count: 4 } },
  
  { type: 'shaped', shape: ['ppp', 'p p', 'ppp'], ingredients: { p: 'oak_planks' }, out: { blockId: 'chest', count: 1 } },
  { type: 'shaped', shape: ['ppp', 'p p', 'ppp'], ingredients: { p: 'birch_planks' }, out: { blockId: 'chest', count: 1 } },
  { type: 'shaped', shape: ['ppp', 'p p', 'ppp'], ingredients: { p: 'spruce_planks' }, out: { blockId: 'chest', count: 1 } },
  
  { type: 'shaped', shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'oak_planks' }, out: { blockId: 'oak_stairs', count: 4 } },
  { type: 'shaped', shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'birch_planks' }, out: { blockId: 'birch_stairs', count: 4 } },
  { type: 'shaped', shape: ['p  ', 'pp ', 'ppp'], ingredients: { p: 'spruce_planks' }, out: { blockId: 'spruce_stairs', count: 4 } },
];

function canSatisfy(inputs, needs) {
  for (const id in needs) {
    if ((inputs[id] || 0) < needs[id]) return false;
  }
  return true;
}

function recomputeCraft() {
  craftOutput = null;
  craftMatch = null;

  const grid = openContainer?.title === 'Crafting Table' ? craftGrid : inventoryCraftGrid;
  const gridWidth = openContainer?.title === 'Crafting Table' ? 3 : 2;

  // Optimize by precomputing inputs only once
  const inputs = {};
  let hasAnyBlocks = false;
  for (const s of grid) {
    if (!s || s.type !== 'block') continue;
    inputs[s.blockId] = (inputs[s.blockId] || 0) + 1;
    hasAnyBlocks = true;
  }

  // Early exit if no blocks in grid
  if (!hasAnyBlocks) return;

  // Check shapeless recipes first
  for (const r of recipes) {
    if (r.type === 'shapeless' && canSatisfy(inputs, r.in)) {
      const outBlock = r.out.blockId;
      const outItem = r.out.itemId;
      if (outBlock) {
        const displayName = registry.get(outBlock)?.displayName || outBlock;
        craftOutput = { type: 'block', blockId: outBlock, displayName, count: r.out.count, maxStack: 64 };
      } else if (outItem) {
        const displayName = (outItem === 'stick' ? 'Stick' : outItem);
        craftOutput = { type: 'item', itemId: outItem, displayName, count: r.out.count, maxStack: 64 };
      }
      craftMatch = r;
      return;
    }
  }

  // Check shaped recipes
  for (const r of recipes) {
    if (r.type !== 'shaped') continue;

    const shape = r.shape;
    const shapeHeight = shape.length;
    const shapeWidth = shape[0].length;

    // Early exit if recipe is too big for grid
    if (shapeHeight > gridWidth || shapeWidth > gridWidth) continue;

    for (let y = 0; y <= gridWidth - shapeHeight; y++) {
      for (let x = 0; x <= gridWidth - shapeWidth; x++) {
        let match = true;
        const consumed = {};

        for (let sy = 0; sy < shapeHeight; sy++) {
          for (let sx = 0; sx < shapeWidth; sx++) {
            const shapeKey = shape[sy][sx];
            const gridIndex = (y + sy) * gridWidth + (x + sx);
            const gridItem = grid[gridIndex];

            if (shapeKey === ' ') {
              if (gridItem) {
                match = false;
                break;
              }
            } else {
              const ingredient = r.ingredients[shapeKey];
              if (!gridItem || gridItem.blockId !== ingredient) {
                match = false;
                break;
              }
              consumed[gridIndex] = (consumed[gridIndex] || 0) + 1;
            }
          }
          if (!match) break;
        }

        if (match) {
          // Check that no other items are in the grid
          for (let i = 0; i < grid.length; i++) {
            if (grid[i] && !consumed[i]) {
              match = false;
              break;
            }
          }
        }

        if (match) {
          const outBlock = r.out.blockId;
          const outItem = r.out.itemId;
          if (outBlock) {
            const displayName = registry.get(outBlock)?.displayName || outBlock;
            craftOutput = { type: 'block', blockId: outBlock, displayName, count: r.out.count, maxStack: 64 };
          } else if (outItem) {
            const displayName = (outItem === 'stick' ? 'Stick' : outItem);
            craftOutput = { type: 'item', itemId: outItem, displayName, count: r.out.count, maxStack: 64 };
          }
          craftMatch = r;
          return;
        }
      }
    }
  }
}

function consumeCraftInputs(match) {
  if (!match) return false;

  const grid = openContainer?.title === 'Crafting Table' ? craftGrid : inventoryCraftGrid;
  const gridWidth = openContainer?.title === 'Crafting Table' ? 3 : 2;

  if (match.type === 'shapeless') {
    const needs = { ...match.in };
    for (let i = 0; i < grid.length; i++) {
      const s = grid[i];
      if (!s) continue;
      const need = needs[s.blockId] || 0;
      if (need <= 0) continue;
      s.count -= 1;
      needs[s.blockId] -= 1;
      if (s.count <= 0) grid[i] = null;
    }
    for (const id in match.in) {
      if ((needs[id] || 0) > 0) return false;
    }
    return true;
  } else if (match.type === 'shaped') {
    const shape = match.shape;
    const shapeHeight = shape.length;
    const shapeWidth = shape[0].length;

    // Early exit if recipe is too big for grid
    if (shapeHeight > gridWidth || shapeWidth > gridWidth) return false;

    for (let y = 0; y <= gridWidth - shapeHeight; y++) {
      for (let x = 0; x <= gridWidth - shapeWidth; x++) {
        let isMatch = true;
        for (let sy = 0; sy < shapeHeight; sy++) {
          for (let sx = 0; sx < shapeWidth; sx++) {
            const shapeKey = shape[sy][sx];
            const gridIndex = (y + sy) * gridWidth + (x + sx);
            const gridItem = grid[gridIndex];
            if (shapeKey === ' ') {
              if (gridItem) {
                isMatch = false;
                break;
              }
            } else {
              const ingredient = match.ingredients[shapeKey];
              if (!gridItem || gridItem.blockId !== ingredient) {
                isMatch = false;
                break;
              }
            }
          }
          if (!isMatch) break;
        }

        if (isMatch) {
          for (let sy = 0; sy < shapeHeight; sy++) {
            for (let sx = 0; sx < shapeWidth; sx++) {
              const shapeKey = shape[sy][sx];
              if (shapeKey !== ' ') {
                const gridIndex = (y + sy) * gridWidth + (x + sx);
                const gridItem = grid[gridIndex];
                gridItem.count -= 1;
                if (gridItem.count <= 0) {
                  grid[gridIndex] = null;
                }
              }
            }
          }
          return true;
        }
      }
    }
    return false;
  }
}

function tryPickupCraft() {
  if (!craftOutput || !craftMatch) return false;
  if (!draggingStack) {
    if (!consumeCraftInputs(craftMatch)) return false;
    draggingStack = { ...craftOutput };
    recomputeCraft();
    return true;
  } else if (inventory.canMerge(draggingStack, craftOutput)) {
    const room = (draggingStack.maxStack ?? 64) - draggingStack.count;
    if (room < craftOutput.count) return false;
    if (!consumeCraftInputs(craftMatch)) return false;
    draggingStack.count += craftOutput.count;
    recomputeCraft();
    return true;
  }
  return false;
}

function tileCenterWorld(tileX, tileY) {
  return { x: (tileX + 0.5) * TILE_SIZE, y: (tileY + 0.5) * TILE_SIZE };
}
function distance(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
function isExposed(world, x, y) {
  const neighbors = [
    [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
  ];
  for (const [nx, ny] of neighbors) {
    if (!world.inBounds(nx, ny)) continue;
    const t = world.getBlockType(nx, ny);
    if (!t || !t.solid) return true;
  }
  return false;
}
function hasLineOfSight(world, from, toWorld, targetTileX, targetTileY) {
  const dx = toWorld.x - from.x;
  const dy = toWorld.y - from.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (TILE_SIZE * 0.25)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = from.x + dx * t;
    const py = from.y + dy * t;
    const tx = Math.floor(px / TILE_SIZE);
    const ty = Math.floor(py / TILE_SIZE);
    if (tx === targetTileX && ty === targetTileY) return true;
    const bt = world.getBlockType(tx, ty);
    if (bt && bt.solid) return false;
  }
  return true;
}
function canReachTile(tileX, tileY) {
  const head = player.getHeadAnchor();
  const center = tileCenterWorld(tileX, tileY);
  if (distance(head, center) > REACH_TILES * TILE_SIZE) return false;
  return hasLineOfSight(world, head, center, tileX, tileY);
}
function getMouseTileFromRaw(screenX, screenY) {
  const worldX = camera.screenToWorldX(screenX);
  const worldY = camera.screenToWorldY(screenY);
  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);
  return { worldX, worldY, tileX, tileY };
}
function getMouseTileFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const screenX = (e.clientX - rect.left) * window.devicePixelRatio;
  const screenY = (e.clientY - rect.top) * window.devicePixelRatio;
  return { screenX, screenY, ...getMouseTileFromRaw(screenX, screenY) };
}

function handleInventoryClick(screenX, screenY, isRightClick = false) {
  const hit = renderer.getUIHit(screenX, screenY);
  if (!hit) return false;

  if (hit.area === 'craftOut') {
    if (tryPickupCraft()) return true;
    return true;
  }

  function getSlotRef(area, index) {
    if (area === 'inventory') {
      return {
        get: () => inventory.getSlot(index),
        set: (v) => inventory.setSlot(index, v),
        take: () => inventory.takeSlot(index),
      };
    } else if (area === 'container') {
      return {
        get: () => {
          // Check if the container is still valid
          if (!openContainer || !openContainer.slots) {
            return null;
          }
          // Additional check to ensure the container is still at the expected location
          const blockId = world.getBlockId(openContainer.tileX, openContainer.tileY);
          if (blockId !== 'chest' && blockId !== 'crafting_table') {
            return null;
          }
          return openContainer.slots[index] ?? null;
        },
        set: (v) => { 
          // Check if the container is still valid before setting
          if (openContainer && openContainer.slots) {
            // Additional check to ensure the container is still at the expected location
            const blockId = world.getBlockId(openContainer.tileX, openContainer.tileY);
            if (blockId === 'chest' || blockId === 'crafting_table') {
              openContainer.slots[index] = v;
            }
          }
        },
        take: () => {
          // Check if the container is still valid before taking
          if (!openContainer || !openContainer.slots) {
            return null;
          }
          // Additional check to ensure the container is still at the expected location
          const blockId = world.getBlockId(openContainer.tileX, openContainer.tileY);
          if (blockId !== 'chest' && blockId !== 'crafting_table') {
            return null;
          }
          const s = openContainer.slots[index];
          openContainer.slots[index] = null;
          return s;
        },
      };
    } else if (area === 'craft') {
      const grid = openContainer?.title === 'Crafting Table' ? craftGrid : inventoryCraftGrid;
      return {
        get: () => grid[index],
        set: (v) => { grid[index] = v; },
        take: () => { const s = grid[index]; grid[index] = null; return s; }
      };
    }
    return null;
  }

  if (hit.area === 'creative' && creativeMode) {
    const all = inventory.getAllBlocks();
    const blk = all[hit.index];
    if (!blk) return false;
    if (!draggingStack) {
      draggingStack = { ...blk };
    } else {
      const s0 = inventory.getSlot(0);
      if (!s0) {
        inventory.setSlot(0, draggingStack);
        draggingStack = null;
      } else if (inventory.canMerge(s0, draggingStack)) {
        const room = (s0.maxStack ?? 64) - s0.count;
        const take = Math.min(room, draggingStack.count);
        s0.count += take;
        draggingStack.count -= take;
        if (draggingStack.count <= 0) draggingStack = null;
      }
    }
    recomputeCraft();
    return true;
  }

  const slotRef = getSlotRef(hit.area, hit.index);
  if (!slotRef) return false;

  const slot = slotRef.get();

  if (!draggingStack) {
    if (!slot) return false;
    if (isRightClick && slot.count > 1) {
      const take = Math.ceil(slot.count / 2);
      draggingStack = { ...slot, count: take };
      slot.count -= take;
      if (slot.count <= 0) slotRef.set(null);
    } else {
      draggingStack = slotRef.take();
    }
    recomputeCraft();
    return true;
  }

  if (!slot) {
    if (isRightClick) {
      const one = { ...draggingStack, count: 1 };
      slotRef.set(one);
      draggingStack.count -= 1;
      if (draggingStack.count <= 0) draggingStack = null;
    } else {
      // For container slots, we need to ensure the container is still valid
      if (hit.area === 'container') {
        // Additional validation before setting
        if (openContainer && (world.getBlockId(openContainer.tileX, openContainer.tileY) === 'chest' || 
                              world.getBlockId(openContainer.tileX, openContainer.tileY) === 'crafting_table')) {
          // Before setting, let's verify the slotRef is working correctly
          slotRef.set(draggingStack);
          draggingStack = null;
        } else {
          // If container is no longer valid, add item back to inventory
          if (draggingStack.type === 'block') {
            inventory.addBlock(draggingStack.blockId, draggingStack.count);
          } else {
            inventory.addItem(draggingStack.itemId, draggingStack.count);
          }
          draggingStack = null;
        }
      } else {
        slotRef.set(draggingStack);
        draggingStack = null;
      }
    }
    recomputeCraft();
    return true;
  }

  if (inventory.canMerge(slot, draggingStack)) {
    if (isRightClick) {
      if (slot.count < (slot.maxStack ?? 64)) {
        slot.count += 1;
        draggingStack.count -= 1;
        if (draggingStack.count <= 0) draggingStack = null;
      }
    } else {
      const room = (slot.maxStack ?? 64) - slot.count;
      const take = Math.min(room, draggingStack.count);
      slot.count += take;
      draggingStack.count -= take;
      if (draggingStack.count <= 0) draggingStack = null;
    }
    recomputeCraft();
    return true;
  } else {
    if (isRightClick) {
      const one = { ...draggingStack, count: 1 };
      let placed = false;
      for (let i = 0; i < inventory.TOTAL_SLOTS; i++) {
        const s = inventory.slots[i];
        if (!s) {
          inventory.slots[i] = one;
          draggingStack.count -= 1;
          if (draggingStack.count <= 0) draggingStack = null;
          placed = true;
          break;
        } else if (inventory.canMerge(s, one) && s.count < (s.maxStack ?? 64)) {
          s.count += 1;
          draggingStack.count -= 1;
          if (draggingStack.count <= 0) draggingStack = null;
          placed = true;
          break;
        }
      }
      recomputeCraft();
      return placed;
    } else {
      // Swap items instead of deleting
      const temp = slotRef.take();
      slotRef.set(draggingStack);
      draggingStack = temp;
      recomputeCraft();
      return true;
    }
  }
}

canvas.addEventListener('mousedown', (e) => {
  const { screenX, worldX, worldY, tileX, tileY } = getMouseTileFromEvent(e);
  const uiOpen = inventoryOpen || !!openContainer;
  if (uiOpen) {
    if (e.button === 0) handleInventoryClick(screenX, screenY, false);
    else if (e.button === 2) handleInventoryClick(screenX, screenY, true);
    return;
  }
  if (e.button === 2) {
    const blockId = world.getBlockId(tileX, tileY);
    if (blockId === 'crafting_table') {
      openContainer = {
        title: 'Crafting Table',
        slots: craftGrid,
        capacity: 9,
        tileX,
        tileY,
      };
      inventoryOpen = true;
      recomputeCraft();
      return;
    } else if (blockId === 'chest') {
      const cell = world.getCell(tileX, tileY);
      if (!cell.meta) cell.meta = {};
      
      // Handle double chests
      let slots = cell.meta.inv;
      let capacity = 27;
      let title = 'Chest';
      
      // Check if this is part of a double chest
      if (cell.meta.chestType === 'left') {
        // Left side of double chest
        title = 'Double Chest';
        capacity = 54;
        if (!slots) {
          slots = Array.from({ length: 54 }, () => null);
          cell.meta.inv = slots;
        }
      } else if (cell.meta.chestType === 'right') {
        // Right side of double chest - we need to access the left chest's inventory
        title = 'Double Chest';
        capacity = 54;
        // Find the left chest
        if (world.inBounds(tileX - 1, tileY) && world.getBlockId(tileX - 1, tileY) === 'chest') {
          const leftCell = world.getCell(tileX - 1, tileY);
          if (leftCell.meta && leftCell.meta.chestType === 'left') {
            slots = leftCell.meta.inv;
            if (!slots) {
              slots = Array.from({ length: 54 }, () => null);
              leftCell.meta.inv = slots;
            }
          }
        }
      } else {
        // Single chest
        if (!slots) {
          slots = Array.from({ length: 27 }, () => null);
          cell.meta.inv = slots;
        }
      }
      
      openContainer = {
        title: title,
        slots: slots,
        capacity: capacity,
        tileX,
        tileY,
      };
      inventoryOpen = true;
      recomputeCraft();
      return;
    }

    const hotSlot = inventory.getSlot(selectedIndex);
    if (!hotSlot || hotSlot.type !== 'block') return;
    if (!world.inBounds(tileX, tileY)) return;
    if (world.getBlockId(tileX, tileY) !== 'air') return;
    const tileRect = { x: tileX * TILE_SIZE, y: tileY * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE };
    const playerRect = { x: player.x, y: player.y, w: player.width, h: player.height };
    if (rectsOverlap(tileRect.x, tileRect.y, tileRect.w, tileRect.h, playerRect.x, playerRect.y, playerRect.w, playerRect.h)) return;
    if (!canReachTile(tileX, tileY)) return;
    const placed = placer.place(world, { type: 'block', blockId: hotSlot.blockId }, tileX, tileY, {
      mouseWorldX: worldX,
      mouseWorldY: worldY,
      playerX: player.x,
      playerY: player.y,
      modifierFlip: input.isKeyDown('KeyF'),
      rotate: input.isKeyDown('KeyR'),
    });
    if (placed) {
    if (hotSlot.blockId === 'oak_leaves') {
        const cell = world.getCell(tileX, tileY);
        if (!cell.meta) cell.meta = {};
        cell.meta.placed = true;
      }
      if (!creativeMode) {
        if (hotSlot.blockId === 'chest') {
          const cell = world.getCell(tileX, tileY);
          if (!cell.meta) cell.meta = {};
          if (!cell.meta.inv) cell.meta.inv = Array.from({ length: 27 }, () => null);
        }
        hotSlot.count -= 1;
        if (hotSlot.count <= 0) inventory.setSlot(selectedIndex, null);
      }
    }
  }
});

window.addEventListener('mouseup', (e) => {
  if (!(inventoryOpen || openContainer)) return;
  const rect = canvas.getBoundingClientRect();
  const screenX = (e.clientX - rect.left) * window.devicePixelRatio;
  const screenY = (e.clientY - rect.top) * window.devicePixelRatio;

  const hit = renderer.getUIHit(screenX, screenY);

  if (draggingStack && !hit) {
    if (draggingStack.type === 'block') {
      inventory.addBlock(draggingStack.blockId, draggingStack.count);
    } else {
      for (let i = 0; i < inventory.TOTAL_SLOTS && draggingStack && draggingStack.count > 0; i++) {
        const s = inventory.slots[i];
        if (s && inventory.canMerge(s, draggingStack) && s.count < (s.maxStack ?? 64)) {
          const room = (s.maxStack ?? 64) - s.count;
          const take = Math.min(room, draggingStack.count);
          s.count += take;
          draggingStack.count -= take;
        } else if (!s && draggingStack) {
          inventory.slots[i] = draggingStack;
          draggingStack = null;
          break;
        }
      }
      if (draggingStack && draggingStack.count > 0) {
        if (!inventory.slots[0]) {
          inventory.slots[0] = draggingStack;
        } else {
          const s0 = inventory.slots[0];
          if (inventory.canMerge(s0, draggingStack)) {
            const room = (s0.maxStack ?? 64) - s0.count;
            const take = Math.min(room, draggingStack.count);
            s0.count += take;
            draggingStack.count -= take;
          }
        }
      }
    }
    draggingStack = null;
    recomputeCraft();
    return;
  }

  if (e.button === 0 || e.button === 2) {
    handleInventoryClick(screenX, screenY, e.button === 2);
  }
});

window.addEventListener('keydown', (e) => {
  // Handle text input mode
  if (textInputMode) {
    // Allow Escape to exit text input mode
    if (e.code === 'Escape') {
      textInputMode = false;
      if (typeof window !== 'undefined') {
        window.textInputMode = false;
      }
      textInputValue = '';
      e.preventDefault();
      return;
    }
    
    if (e.code === 'Enter') {
      processTextInputCommand(textInputValue);
      textInputMode = false;
      if (typeof window !== 'undefined') {
        window.textInputMode = false;
      }
      textInputValue = '';
      e.preventDefault();
      return;
    }
    
    // Allow Backspace to delete characters
    if (e.code === 'Backspace') {
      textInputValue = textInputValue.slice(0, -1);
      e.preventDefault();
      return;
    }
    
    // Don't prevent default for other keys - let them be typed normally
    // Only prevent default for keys we've specifically handled above
    return;
  }
  
  if (e.code === 'KeyE') {
    const uiOpen = inventoryOpen || !!openContainer;
    if (uiOpen) {
      inventoryOpen = false;
      openContainer = null;
      if (draggingStack) {
        if (draggingStack.type === 'block') {
          const leftover = inventory.addBlock(draggingStack.blockId, draggingStack.count);
          draggingStack = leftover > 0 ? draggingStack : null;
        } else {
          let placed = false;
          for (let i = 0; i < inventory.TOTAL_SLOTS && draggingStack && draggingStack.count > 0; i++) {
            const s = inventory.slots[i];
            if (s && inventory.canMerge(s, draggingStack) && s.count < (s.maxStack ?? 64)) {
              const room = (s.maxStack ?? 64) - s.count;
              const take = Math.min(room, draggingStack.count);
              s.count += take;
              draggingStack.count -= take;
              placed = true;
            }
          }
          if (draggingStack && draggingStack.count > 0) {
            for (let i = 0; i < inventory.TOTAL_SLOTS && draggingStack && draggingStack.count > 0; i++) {
              if (!inventory.slots[i]) {
                inventory.slots[i] = draggingStack;
                draggingStack = null;
                placed = true;
                break;
              }
            }
          }
        }
      }
      if (!draggingStack || draggingStack.count <= 0) draggingStack = null;
      recomputeCraft();
    } else {
      inventoryOpen = true;
      recomputeCraft();
    }
  }
  if (e.code === 'Escape') {
    inventoryOpen = false;
    openContainer = null;
    draggingStack = null;
    recomputeCraft();
  }
  if (e.code === 'KeyT') {
    // Toggle text input mode
    textInputMode = true;
    if (typeof window !== 'undefined') {
      window.textInputMode = true;
    }
    textInputValue = '';
    e.preventDefault();
  }
  if (e.code.startsWith('Digit')) {
    const idx = parseInt(e.code.replace('Digit', ''), 10) - 1;
    if (!Number.isNaN(idx) && idx >= 0 && idx < 9) {
      selectedIndex = idx;
    }
  }
  if (e.code === 'KeyC') {
    creativeMode = !creativeMode;
    console.log('Creative mode:', creativeMode);
  }
  if (e.code === 'KeyX') {
    noClipMode = !noClipMode;
    console.log('No clip mode:', noClipMode);
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    if (inventoryOpen || openContainer) {
      if (craftOutput && craftMatch) {
        let craftedCount = 0;
        const maxCraftable = 64;
        for (let i = 0; i < maxCraftable; i++) {
          if (consumeCraftInputs(craftMatch)) {
            craftedCount += craftOutput.count;
          } else {
            break;
          }
        }
        
        if (craftedCount > 0) {
          const craftedStack = { ...craftOutput, count: craftedCount };
          
          if (craftedStack.type === 'block') {
            inventory.addBlock(craftedStack.blockId, craftedStack.count);
          } else if (craftedStack.type === 'item') {
            inventory.addItem(craftedStack.itemId, craftedStack.count);
          }
          
          recomputeCraft();
        }
      }
    }
  }
});

// Handle text input for typing commands
window.addEventListener('keypress', (e) => {
  if (textInputMode && e.key.length === 1) {
    textInputValue += e.key;
    // Don't prevent default for regular character keys, only prevent for special keys handled elsewhere
  }
});

const renderer = new Renderer(
  ctx, canvas, world, registry, camera, input, player, inventory, breaker, clouds,
  () => ({
    selectedIndex,
    inventoryOpen,
    openContainer,
    draggingStack,
    craftGrid,
    inventoryCraftGrid,
    craftOutput,
    creativeMode,
    textInputMode,
    textInputValue,
    items // expose the runtime items array so renderer can draw dropped items
  })
);

renderer.preloadTextures();

  // Item entity class (time-driven bobbing, initial drop animation, and homing pickup)
class ItemEntity {
  constructor(blockId, x, y, spawnWorldTime = 0) {
    this.blockId = blockId;
    // store intended settle position in pixels
    this.baseX = x;
    this.baseY = y;
    // visual position (updated from world.time)
    this.x = x;
    this.y = y;
    // Physics properties
    this.vx = 0; // Horizontal velocity
    this.vy = 0; // Vertical velocity
    this.gravity = 500; // Gravity in pixels per second squared
    this.bounce = 0.2; // Bounce damping factor (reduced)
    this.width = Math.round(TILE_SIZE * 0.45);
    this.height = Math.round(TILE_SIZE * 0.45);
    this.life = 0;
    this.maxLife = 30;
    this._seed = Math.random() * 1000;
    this._hoverAmp = Math.max(0.5, TILE_SIZE * 0.01); // Minimal bob amplitude in px
    this._hoverFreq = 1.5 + Math.random() * 0.5; // bob frequency
    this._horizAmp = 0; // No horizontal wobble to prevent sliding
    // spawn animation
    this.spawnTime = spawnWorldTime;
    this.spawnDuration = 0.22; // seconds of world time to settle
    // homing
    this._attractRadius = TILE_SIZE * 2.0;
    this._pickupRadius = TILE_SIZE * 0.5; // Pickup radius
    this._lastWorldTime = spawnWorldTime;
    // Grounded state
    this.grounded = false;
    this.settleY = null; // Will be calculated dynamically
    // Fixed X position to prevent sliding when grounded
    this.fixedX = Math.floor(x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
  }

  // worldTime = world.time (already scaled by gameSpeed)
  update(worldTime, world) {
    const dt = Math.max(0, (worldTime - (this._lastWorldTime || worldTime)));
    this._lastWorldTime = worldTime;
    this.life += dt;

    // Homing: if player within attract radius, move toward player
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    const dx = playerCenterX - this.x;
    const dy = playerCenterY - this.y;
    const distance = Math.hypot(dx, dy);

    // Apply gravity when not being attracted to player
    this.vy += this.gravity * dt;
    
    // Limit fall speed
    if (this.vy > 300) this.vy = 300;

    // If within attract radius, move toward player
    if (distance < this._attractRadius) {
      const attractStrength = 300.0; // pixels per second
      const nx = dx / (distance || 1);
      const ny = dy / (distance || 1);
      // Apply velocity directly for smooth movement
      this.vx = nx * attractStrength;
      this.vy = ny * attractStrength;
    } else {
      // No horizontal movement when not attracted
      this.vx = 0;
    }

    // Update position based on velocity
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Always check if we should be grounded based on current terrain
    this.settleY = findDropY(this.x, this.y);
    
    // Check for ground collision
    if (this.settleY !== null && this.y >= this.settleY && this.vy > 0) {
      // Landed on ground
      this.y = this.settleY;
      this.vy = -Math.abs(this.vy) * this.bounce; // Bounce with damping
      this.grounded = true;
      
      // If bounce is very small, stop bouncing
      if (Math.abs(this.vy) < 5) {
        this.vy = 0;
      }
    } else if (this.vy === 0 && this.settleY !== null && Math.abs(this.y - this.settleY) < 1) {
      // Already on ground
      this.grounded = true;
    } else {
      // Not on ground
      this.grounded = false;
    }

    // Apply bobbing only when grounded
    if (this.grounded && this.vy === 0) {
      const t = worldTime * 0.001;
      const bob = Math.sin(t * this._hoverFreq + this._seed) * this._hoverAmp;
      
      // Use fixedX to prevent sliding when grounded
      this.x = this.fixedX;
      this.y = this.settleY + bob;
    }

    // Pickup check uses current visual distance
    const px = playerCenterX - this.x;
    const py = playerCenterY - this.y;
    const pd = Math.hypot(px, py);
    if (pd <= this._pickupRadius) return true;

    // Expire by life (world-time scaled)
    if (this.life > this.maxLife) return true;
    return false;
  }
}

  const engine = new Engine((dt, time) => {
  // Scale world time by gameSpeed so time-based ticks (oxidation, growth, day/night) speed up.
  world.time = time * gameSpeed;
  
  player.update(input, dt, time, noClipMode);

  const uiOpen = inventoryOpen || !!openContainer;
  if (input.mouse.leftDown && !uiOpen) {
    let { tileX, tileY } = getMouseTileFromRaw(input.mouse.x, input.mouse.y);
    
    if (world.inBounds(tileX, tileY) && canReachTile(tileX, tileY) && isExposed(world, tileX, tileY)) {
      breaker.begin(world, tileX, tileY, creativeMode);
    } else {
      breaker.cancel();
    }
  } else {
    breaker.cancel();
  }

  const broke = breaker.update(world, dt * gameSpeed);
  if (broke && broke.id) {
    // Always spawn dropped item entities (creative mode also drops)
    const itemX = broke.x * TILE_SIZE + TILE_SIZE / 2;
    const itemY = (broke.y + 0.5) * TILE_SIZE;
    items.push(new ItemEntity(broke.id, itemX, itemY, world.time));

    // If chest, spawn each item from inventory as separate drops (settle to ground)
    if (broke.id === 'chest' && broke.meta && Array.isArray(broke.meta.inv)) {
      for (const stack of broke.meta.inv) {
        if (stack && stack.type === 'block' && stack.count > 0) {
          for (let i = 0; i < stack.count; i++) {
            const rx = broke.x * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * TILE_SIZE * 0.6;
            const ry = (broke.y + 0.5) * TILE_SIZE + (Math.random() - 0.5) * TILE_SIZE * 0.6;
            items.push(new ItemEntity(stack.blockId, rx, ry, world.time));
          }
        }
      }
    }

    // Remove the block from the world (drops exist visually and can be picked up)
    world.setBlock(broke.x, broke.y, 'air', null);

    if (openContainer && openContainer.tileX === broke.x && openContainer.tileY === broke.y) {
      openContainer = null;
    }
  }

  // Update item entities (scale by gameSpeed)
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const shouldRemove = item.update(world.time, world);
    
    if (shouldRemove) {
      // Add to inventory when picked up
      inventory.addBlock(item.blockId, 1);
      items.splice(i, 1);
    } else if (item.life > item.maxLife) {
      // Remove items that have existed too long
      items.splice(i, 1);
    }
  }

  // Check if the container is still valid
  if (openContainer) {
    const blockId = world.getBlockId(openContainer.tileX, openContainer.tileY);
    if (blockId !== 'chest' && blockId !== 'crafting_table') {
      openContainer = null;
    }
  }
  // Scale world tick and cloud updates by gameSpeed so /tick affects them
  world.tick(dt * gameSpeed, time * gameSpeed);
  clouds.update(dt * gameSpeed);
  const head = player.getHeadAnchor();
  const mouseWorldX = camera.screenToWorldX(input.mouse.x);
  const mouseWorldY = camera.screenToWorldY(input.mouse.y);
  const bias = 0.35;
  const targetX = head.x * (1 - bias) + mouseWorldX * bias;
  const targetY = head.y * (1 - bias) + mouseWorldY * bias;
  camera.followTo(targetX, targetY, canvas, world);
}, () => {
  renderer.render();
});
engine.start();
