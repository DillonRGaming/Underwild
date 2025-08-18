import { Engine } from './src/core/engine.js';
import { Input } from './src/core/input.js';
import { Renderer } from './src/core/renderer.js';
import { World } from './src/core/world.js';
import { Camera } from './src/core/camera.js';
import { BlockRegistry } from './src/core/registry.js';
import { Player } from './src/entities/player.js';
import { TILE_SIZE, rectsOverlap } from './src/core/utils.js';
import { registerAllBlocks } from './blocks/index.js';
import { registerAllItems } from './items/index.js';
import { generateTerrain } from './src/logic/terrainGen.js';
import { Placer } from './src/logic/placing.js';
import { Breaker } from './src/logic/breaking.js';
import { findMatchingRecipe, consumeRecipeIngredients, createRecipeOutput } from './src/logic/crafting.js';

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
registerAllItems(registry);

const WORLD_WIDTH = 256;
const WORLD_HEIGHT = 350;
const world = new World(WORLD_WIDTH, WORLD_HEIGHT, registry);
// Generate a new random seed each time the game loads
let currentSeed = Math.floor(Math.random() * 1000000);
generateTerrain(world, { seed: currentSeed });

const items = [];
const leafParticles = [];
let gameSpeed = 1;

function findSurfaceY(tileX) {
  for (let y = 0; y < world.height; y++) {
    const id = world.getBlockId(tileX, y);
    if (id === 'grass' || id === 'sand') {
      return y;
    }
  }
  return 50 + Math.floor(((tileX * 13 + currentSeed) % 1000) / 100);
}

function findDropY(xPixel, yPixel) {
  const tileX = Math.floor(xPixel / TILE_SIZE);
  let tileY = Math.floor(yPixel / TILE_SIZE);

  if (!world.inBounds(tileX, tileY)) {
    tileY = Math.max(0, Math.min(world.height - 1, tileY));
  }

  const currentType = world.getBlockType(tileX, tileY);
  if (currentType && currentType.solid) {
    while (tileY > 0) {
      const checkType = world.getBlockType(tileX, tileY - 1);
      if (!checkType || !checkType.solid) break;
      tileY--;
    }
  }

  while (tileY < world.height - 1) {
    const belowType = world.getBlockType(tileX, tileY + 1);
    if (belowType && belowType.solid) break;
    tileY++;
  }

  return (tileY + 0.5) * TILE_SIZE;
}

const spawnTileX = 100;
const groundY = findSurfaceY(spawnTileX);
const spawnX = TILE_SIZE * spawnTileX;
// Spawn player above the ground with proper clearance
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
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.type === 'block' && s.blockId === blockId && s.count < (s.maxStack ?? 64)) {
        const room = (s.maxStack ?? 64) - s.count;
        const take = Math.min(room, count);
        s.count += take;
        count -= take;
      }
    }
    
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
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.type === 'item' && s.itemId === itemId && s.count < (s.maxStack ?? 64)) {
        const room = (s.maxStack ?? 64) - s.count;
        const take = Math.min(room, count);
        s.count += take;
        count -= take;
      }
    }
    
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
let showOutline = true;

if (typeof window !== 'undefined') {
  window.textInputMode = textInputMode;
}

const placer = new Placer(registry);
const breaker = new Breaker(registry);

const inventoryCraftGrid = Array.from({ length: 4 }, () => null);
const craftGrid = Array.from({ length: 9 }, () => null);
let craftOutput = null;
let craftMatch = null;

function processTextInputCommand(command) {
  if (!command.trim()) return;

  const trimmed = command.trim();
  if (trimmed.startsWith('/')) {
    const parts = trimmed.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === 'give') {
      const id = parts[1];
      const amount = parts.length > 2 ? parseInt(parts[2], 10) : 1;
      if (!id) { return; }
      if (isNaN(amount) || amount <= 0) { return; }

      const block = registry.get(id);
      if (block) {
        const leftover = inventory.addBlock(id, amount);
      } else {
        if (id === 'stick' || id === 'apple') {
          const leftover = inventory.addItem(id, amount);
        }
      }
      return;
    }

    if (cmd === 'tick') {
      const val = parts.length > 1 ? parseFloat(parts[1]) : NaN;
      if (isNaN(val) || val <= 0) {
        return;
      }
      gameSpeed = val;
      return;
    }

    if (cmd === 'tp') {
      const tx = parts.length > 1 ? Number(parts[1]) : NaN;
      const ty = parts.length > 2 ? Number(parts[2]) : NaN;
      if (Number.isNaN(tx) || Number.isNaN(ty)) {
        return;
      }
      player.x = tx * TILE_SIZE;
      player.y = ty * TILE_SIZE;
      player.vx = 0;
      player.vy = 0;
      return;
    }

    if (cmd === 'seed') {
      if (parts.length > 1) {
        const newSeed = parseInt(parts[1], 10);
        if (isNaN(newSeed)) {
          return;
        }
        currentSeed = newSeed;
        
        for (let i = 0; i < world.cells.length; i++) {
          world.cells[i] = { id: 'air', meta: null };
        }
        
        generateTerrain(world, { seed: currentSeed });
        
        const spawnTileX = 100;
        setTimeout(() => {
          const groundY = findSurfaceY(spawnTileX);
          player.x = TILE_SIZE * spawnTileX;
          player.y = (groundY - 2) * TILE_SIZE;
          player.vx = 0;
          player.vy = 0;
          player.onGround = false;
        }, 0);
      }
      return;
    }

    return;
  }

  const parts = trimmed.split(' ');
  const blockId = parts[0];
  const count = parts.length > 1 ? parseInt(parts[1]) : 1;

  if (isNaN(count) || count <= 0) {
    return;
  }

  const block = registry.get(blockId);
  if (block) {
    const leftover = inventory.addBlock(blockId, count);
  } else {
    if (blockId === 'stick' || blockId === 'apple') {
      const leftover = inventory.addItem(blockId, count);
    }
  }
}

function recomputeCraft() {
  craftOutput = null;
  craftMatch = null;

  const grid = openContainer?.title === 'Crafting Table' ? craftGrid : inventoryCraftGrid;
  const is3x3 = openContainer?.title === 'Crafting Table';
  
  craftMatch = findMatchingRecipe(grid, is3x3);
  
  if (craftMatch) {
    craftOutput = createRecipeOutput(craftMatch, registry);
  }
}

function consumeCraftInputs(match) {
  if (!match) return false;

  const grid = openContainer?.title === 'Crafting Table' ? craftGrid : inventoryCraftGrid;
  const is3x3 = openContainer?.title === 'Crafting Table';
  
  const consumed = consumeRecipeIngredients(grid, match, is3x3);
  
  if (!consumed) return false;
  
  for (const index in consumed) {
    const consumedItem = consumed[index];
    const gridItem = grid[index];
    
    if (gridItem && gridItem.type === consumedItem.type) {
      if (consumedItem.type === 'block' && gridItem.blockId === consumedItem.blockId) {
        gridItem.count -= consumedItem.count;
        if (gridItem.count <= 0) {
          grid[index] = null;
        }
      } else if (consumedItem.type === 'item' && gridItem.itemId === consumedItem.itemId) {
        gridItem.count -= consumedItem.count;
        if (gridItem.count <= 0) {
          grid[index] = null;
        }
      }
    }
  }
  
  return true;
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
          if (!openContainer || !openContainer.slots) {
            return null;
          }
          const blockId = world.getBlockId(openContainer.tileX, openContainer.tileY);
          if (blockId !== 'chest' && blockId !== 'crafting_table') {
            return null;
          }
          return openContainer.slots[index] ?? null;
        },
        set: (v) => { 
          if (openContainer && openContainer.slots) {
            const blockId = world.getBlockId(openContainer.tileX, openContainer.tileY);
            if (blockId === 'chest' || blockId === 'crafting_table') {
              openContainer.slots[index] = v;
            }
          }
        },
        take: () => {
          if (!openContainer || !openContainer.slots) {
            return null;
          }
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
      if (hit.area === 'container') {
        if (openContainer && (world.getBlockId(openContainer.tileX, openContainer.tileY) === 'chest' || 
                              world.getBlockId(openContainer.tileX, openContainer.tileY) === 'crafting_table')) {
          slotRef.set(draggingStack);
          draggingStack = null;
        } else {
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
      
      let slots = cell.meta.inv;
      let capacity = 27;
      let title = 'Chest';
      
      if (cell.meta.chestType === 'left') {
        title = 'Double Chest';
        capacity = 54;
        if (!slots) {
          slots = Array.from({ length: 54 }, () => null);
          cell.meta.inv = slots;
        }
      } else if (cell.meta.chestType === 'right') {
        title = 'Double Chest';
        capacity = 54;
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
  if (textInputMode) {
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
    
    if (e.code === 'Backspace') {
      textInputValue = textInputValue.slice(0, -1);
      e.preventDefault();
      return;
    }
    
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
  }
  if (e.code === 'KeyX') {
    noClipMode = !noClipMode;
  }
  if (e.code === 'KeyP') {
    showOutline = !showOutline;
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

window.addEventListener('keypress', (e) => {
  if (textInputMode && e.key.length === 1) {
    textInputValue += e.key;
  }
});

const renderer = new Renderer(
  ctx, canvas, world, registry, camera, input, player, inventory, breaker,
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
    items,
    leafParticles,
    showOutline
  })
);

renderer.preloadTextures();

const engine = new Engine((dt, time) => {
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
    const itemX = broke.x * TILE_SIZE + TILE_SIZE / 2;
    const itemY = (broke.y + 0.5) * TILE_SIZE;
    const itemEntity = new ItemEntity(broke.id, itemX, itemY, world.time);
    itemEntity.vx = 0;
    itemEntity.vy = 0;
    items.push(itemEntity);

    if (broke.id === 'chest' && broke.meta && Array.isArray(broke.meta.inv)) {
      let itemIndex = 0;
      for (const stack of broke.meta.inv) {
        if (stack && stack.type === 'block' && stack.count > 0) {
          for (let i = 0; i < stack.count; i++) {
            const seedValue = (broke.x * 31 + broke.y * 17 + itemIndex * 13 + currentSeed) % 1000;
            const rx = broke.x * TILE_SIZE + TILE_SIZE / 2 + ((seedValue / 1000) - 0.5) * TILE_SIZE * 0.6;
            const ry = (broke.y + 0.5) * TILE_SIZE + (((seedValue * 17) % 1000) / 1000 - 0.5) * TILE_SIZE * 0.6;
            const chestItemEntity = new ItemEntity(stack.blockId, rx, ry, world.time);
            chestItemEntity.vx = 0;
            chestItemEntity.vy = 0;
            items.push(chestItemEntity);
            itemIndex++;
          }
        }
      }
    }

    world.setBlock(broke.x, broke.y, 'air', null);

    if (openContainer && openContainer.tileX === broke.x && openContainer.tileY === broke.y) {
      openContainer = null;
    }
  }

  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const shouldRemove = item.update(world.time, world);
    
    if (shouldRemove) {
      inventory.addBlock(item.blockId, 1);
      items.splice(i, 1);
    } else if (item.life > item.maxLife) {
      items.splice(i, 1);
    }
  }

  for (let i = leafParticles.length - 1; i >= 0; i--) {
    const particle = leafParticles[i];
    const shouldRemove = particle.update(world.time, world);
    
    if (shouldRemove) {
      leafParticles.splice(i, 1);
    }
  }

  const playerTileX = Math.floor((player.x + player.width / 2) / TILE_SIZE);
  const playerTileY = Math.floor((player.y + player.height / 2) / TILE_SIZE);
  
  const baseChance = 0.001;
  let spawnChance = baseChance;
  
  const radius = 20;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tileX = playerTileX + dx;
      const tileY = playerTileY + dy;
      
      if (world.inBounds(tileX, tileY)) {
        const blockId = world.getBlockId(tileX, tileY);
        if (blockId.endsWith('_leaves')) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          const distanceFactor = Math.max(0, 1 - (distance / radius));
          spawnChance = Math.max(spawnChance, baseChance + (0.0001 * distanceFactor));
          
          if (Math.random() < spawnChance) {
            const particleX = (tileX + 0.5) * TILE_SIZE + (Math.random() - 0.5) * TILE_SIZE * 0.8;
            const particleY = (tileY + 1.1) * TILE_SIZE;
            const particle = new LeafParticle(blockId, particleX, particleY, world.time);
            leafParticles.push(particle);
            spawnChance = baseChance;
          }
        }
      }
    }
  }

  if (openContainer) {
    const blockId = world.getBlockId(openContainer.tileX, openContainer.tileY);
    if (blockId !== 'chest' && blockId !== 'crafting_table') {
      openContainer = null;
    }
  }
  
  world.tick(dt * gameSpeed, time * gameSpeed);
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

class ItemEntity {
  constructor(blockId, x, y, spawnWorldTime = 0) {
    this.blockId = blockId;
    this.baseX = x;
    this.baseY = y;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.gravity = 500;
    this.bounce = 0.2;
    this.width = Math.round(TILE_SIZE * 0.45);
    this.height = Math.round(TILE_SIZE * 0.45);
    this.life = 0;
    this.maxLife = 30;
    this._seed = ((x * 13 + y * 17 + currentSeed) % 1000) / 1000;
    this._hoverAmp = Math.max(0.5, TILE_SIZE * 0.01);
    this._hoverFreq = 1.5 + (this._seed * 0.5);
    this._horizAmp = 0;
    this.spawnTime = spawnWorldTime;
    this.spawnDuration = 0.22;
    this._attractRadius = TILE_SIZE * 2.0;
    this._pickupRadius = TILE_SIZE * 0.5;
    this._lastWorldTime = spawnWorldTime;
    this.grounded = false;
    this.settleY = null;
    this.fixedX = Math.floor(x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
  }

  update(worldTime, world) {
    const dt = Math.max(0, (worldTime - (this._lastWorldTime || worldTime)));
    this._lastWorldTime = worldTime;
    this.life += dt;

    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    const dx = playerCenterX - this.x;
    const dy = playerCenterY - this.y;
    const distance = Math.hypot(dx, dy);

    this.vy += this.gravity * dt;
    
    if (this.vy > 300) this.vy = 300;

    if (distance < this._attractRadius) {
      const attractStrength = 300.0;
      const nx = dx / (distance || 1);
      const ny = dy / (distance || 1);
      this.vx = nx * attractStrength;
      this.vy = ny * attractStrength;
    } else {
      this.vx = 0;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.settleY = findDropY(this.x, this.y);
    
    if (this.settleY !== null && this.y >= this.settleY && this.vy > 0) {
      this.y = this.settleY;
      this.vy = -Math.abs(this.vy) * this.bounce;
      this.grounded = true;
      
      if (Math.abs(this.vy) < 5) {
        this.vy = 0;
      }
    } else if (this.vy === 0 && this.settleY !== null && Math.abs(this.y - this.settleY) < 1) {
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    if (this.grounded && this.vy === 0) {
      const t = worldTime * 0.001;
      const bob = Math.sin(t * this._hoverFreq + this._seed) * this._hoverAmp;
      
      this.x = this.fixedX;
      this.y = this.settleY + bob;
    }

    const px = playerCenterX - this.x;
    const py = playerCenterY - this.y;
    const pd = Math.hypot(px, py);
    if (pd <= this._pickupRadius) return true;

    if (this.life > this.maxLife) return true;
    return false;
  }
}

class LeafParticle {
  constructor(leafType, x, y, spawnWorldTime = 0) {
    this.leafType = leafType;
    this.x = x;
    this.y = y;
    const sizeFactor = 0.3 + Math.random() * 0.7;
    this.width = Math.round(TILE_SIZE * sizeFactor);
    this.height = Math.round(TILE_SIZE * sizeFactor);
    this.vx = (Math.random() - 0.5) * 40;
    this.vy = 0;
    this.gravity = 10;
    this.airResistance = 0.995;
    this.life = 0;
    this.maxLife = 25 + Math.random() * 25;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 1.5;
    this.oscillation = Math.random() * Math.PI * 2;
    this.oscillationSpeed = 0.3 + Math.random() * 0.7;
    this.oscillationAmplitude = 8 + Math.random() * 15;
    this._lastWorldTime = spawnWorldTime;
    this.fadeOut = false;
    this.fadeProgress = 0;
    this.touchingGround = false;
  }

  update(worldTime, world) {
    const dt = Math.max(0, (worldTime - (this._lastWorldTime || worldTime)));
    this._lastWorldTime = worldTime;
    this.life += dt;

    if (this.fadeOut) {
      this.fadeProgress += dt / 3;
      return this.fadeProgress >= 1;
    }

    this.oscillation += this.oscillationSpeed * dt;
    const oscillationOffset = Math.sin(this.oscillation) * this.oscillationAmplitude;
    
    this.vy += this.gravity * dt;
    
    this.vx *= Math.pow(this.airResistance, dt * 60);
    
    if (this.vy > 40) this.vy = 40;

    this.x += (this.vx + oscillationOffset) * dt;
    this.y += this.vy * dt;
    
    this.rotation += this.rotationSpeed * dt;

    const tileX = Math.floor(this.x / TILE_SIZE);
    const tileY = Math.floor((this.y + this.height) / TILE_SIZE);
    
    if (world.inBounds(tileX, tileY)) {
      const blockId = world.getBlockId(tileX, tileY);
      const blockType = world.getBlockType(tileX, tileY);
      
      if (blockId !== 'air' && blockType && blockType.solid && !this.touchingGround) {
        this.touchingGround = true;
        this.fadeOut = true;
        this.fadeProgress = 0;
      }
    }

    if (this.life > this.maxLife) return true;
    return false;
  }
}
