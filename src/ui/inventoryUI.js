// The inventory and container screens: slots, clicking and dragging stacks, the creative menu,
// and the HUD (hotbar, health, hunger, coordinates) kept up to date every few frames.
import { TILE_SIZE } from '../core/utils.js';
import { findMatchingRecipe, createRecipeOutput, consumeRecipeIngredients } from '../logic/crafting.js';
import { ensureFurnaceMeta, smeltingOf, fuelTime, CRUCIBLES, OUT as FURNACE_OUT, FUEL as FURNACE_FUEL } from '../../assets/blocks/furnace.js';
import { gameClock } from '../core/gameClock.js';
import { heatedIngotMaterial } from '../../assets/blocks/forging_table.js';
import { CHEST_SLOTS } from '../../assets/blocks/chest.js';
import { spawnItemEntity } from '../game/entities.js';
import { registry } from '../game/content.js';
import { multiplayer } from '../game/net.js';
import { game, prefs } from '../game/state.js';
import { perfOverlay } from '../game/settings.js';
import { ensureFurnaceUI, updateFurnaceUI, ensureForgeUI, updateForgeUI, ensureRecipeLists, keepCreativeHeight, updateRecipeList } from './craftingUI.js';

// Double-click: the first click picked the stack up; pull every matching stack in the
// inventory onto it, up to a full stack. Things that don't stack are left alone.
export function gatherSameIntoHand() {
  const max = game.draggingStack.maxStack ?? 24;
  if (max <= 1) return false;
  let moved = false;
  for (let i = 0; i < game.inventory.TOTAL_SLOTS && game.draggingStack.count < max; i++) {
    const s = game.inventory.getSlot(i);
    if (!game.inventory.canMerge(game.draggingStack, s)) continue;
    const take = Math.min(max - game.draggingStack.count, s.count);
    game.draggingStack.count += take;
    s.count -= take;
    moved = moved || take > 0;
    if (s.count <= 0) game.inventory.setSlot(i, null);
  }
  if (moved) recomputeCraft();
  return moved;
}

export function throwSelectedBlock() {
  const hotSlot = game.inventory.getSlot(game.selectedIndex);
  if (!hotSlot) return;
  throwFromStack(hotSlot, 1, () => game.inventory.setSlot(game.selectedIndex, null));
}

// Throws `count` from a stack toward the mouse; onEmpty runs if the stack is used up.
function throwFromStack(stack, count, onEmpty) {
  count = Math.min(count, stack.count);
  if (count <= 0) return false;

  const playerCenterX = game.player.x + game.player.width / 2;
  const playerCenterY = game.player.y + game.player.height / 2;
  const dx = game.camera.screenToWorldX(game.input.mouse.x) - playerCenterX;
  const dy = game.camera.screenToWorldY(game.input.mouse.y) - playerCenterY;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 0.001 ? dx / dist : 0;
  const ny = dist > 0.001 ? dy / dist : -1;

  const spawnOffset = Math.max(TILE_SIZE * 0.9, game.player.width * 1.1);
  const spawnX = playerCenterX + nx * spawnOffset;
  let spawnY = playerCenterY + ny * spawnOffset;
  for (let i = 0; i < 6; i++) {
    const tx = Math.floor(spawnX / TILE_SIZE);
    const ty = Math.floor(spawnY / TILE_SIZE);
    if (!game.world.inBounds(tx, ty)) break;
    const bt = game.world.getBlockType(tx, ty);
    if (!bt || !bt.solid) break;
    spawnY -= TILE_SIZE * 0.25;
  }

  if (!spawnItemEntity(stackId(stack), spawnX, spawnY, count, nx * 3, ny * 3)) return false;
  stack.count -= count;
  if (stack.count <= 0) onEmpty();
  return true;
}

// Q in the inventory: throw one of what you're holding on the cursor, or of the slot under
// the mouse (Ctrl+Q throws the whole stack).
export function throwFromInventory(all) {
  if (game.draggingStack) {
    throwFromStack(game.draggingStack, all ? game.draggingStack.count : 1, () => {
      game.draggingStack = null;
    });
    recomputeCraft();
    return;
  }
  const hit = getUIHitFromElement(document.elementFromPoint(lastMouseClient.x, lastMouseClient.y));
  if (!hit || hit.area === 'craftOut' || hit.area === 'creative' || hit.area === 'creativeTab') return;
  const ref = getSlotRef(hit.area, hit.index);
  const slot = ref?.get();
  if (!slot) return;
  throwFromStack(slot, all ? slot.count : 1, () => ref.set(null));
  recomputeCraft();
}

export const lastMouseClient = { x: 0, y: 0 };

export function recomputeCraft() {
  game.craftOutput = null;
  game.craftMatch = null;

  const grid = game.openContainer?.title === 'Crafting Table' ? game.craftGrid : game.inventoryCraftGrid;
  const is3x3 = game.openContainer?.title === 'Crafting Table';

  game.craftMatch = findMatchingRecipe(grid, is3x3);

  if (game.craftMatch) {
    game.craftOutput = createRecipeOutput(game.craftMatch, registry);
  }
}

function consumeCraftInputs(match) {
  if (!match) return false;

  const grid = game.openContainer?.title === 'Crafting Table' ? game.craftGrid : game.inventoryCraftGrid;
  const is3x3 = game.openContainer?.title === 'Crafting Table';

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
  if (!game.craftOutput || !game.craftMatch) return false;
  if (!game.draggingStack) {
    if (!consumeCraftInputs(game.craftMatch)) return false;
    game.draggingStack = { ...game.craftOutput };
    recomputeCraft();
    return true;
  } else if (game.inventory.canMerge(game.draggingStack, game.craftOutput)) {
    const room = (game.draggingStack.maxStack ?? 24) - game.draggingStack.count;
    if (room < game.craftOutput.count) return false;
    if (!consumeCraftInputs(game.craftMatch)) return false;
    game.draggingStack.count += game.craftOutput.count;
    recomputeCraft();
    return true;
  }
  return false;
}

function isAnyMenuVisible() {
  return !!document.querySelector('.menu-container:not(.hidden)');
}

export function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function stackId(stack) {
  return stack ? stack.blockId || stack.itemId : null;
}

function addStackToInventory(stack) {
  if (!stack || stack.count <= 0) return 0;
  return game.inventory.add(stack.type === 'item' ? 'item' : 'block', stackId(stack), stack.count, stack.heatedAt ?? null);
}

export function dropStackAtPlayer(stack, count = stack?.count ?? 0) {
  if (!stack || !game.player || count <= 0) return;
  const dir = game.player.facingDirection || 1;
  spawnItemEntity(stackId(stack), game.player.x + game.player.width / 2 + dir * TILE_SIZE, game.player.y + game.player.height * 0.3, count, dir * 2, -1);
}

export function returnStackToInventory(stack) {
  if (!stack) return;
  const leftover = addStackToInventory(stack);
  if (leftover > 0) dropStackAtPlayer(stack, leftover);
}

export function closeInventory() {
  document.getElementById('creativeSearch')?.blur();
  returnStackToInventory(game.draggingStack);
  game.draggingStack = null;
  for (const grid of [game.inventoryCraftGrid, game.craftGrid]) {
    for (let i = 0; i < grid.length; i++) {
      returnStackToInventory(grid[i]);
      grid[i] = null;
    }
  }
  game.inventoryOpen = false;
  game.openContainer = null;
  recomputeCraft();
}

export function openChest(tileX, tileY) {
  const cell = game.world.getCell(tileX, tileY);
  if (!cell.meta) cell.meta = {};

  let owner = cell;
  const chestId = game.world.getBlockId(tileX, tileY);
  if (cell.meta.chestType === 'right' && game.world.getBlockId(tileX - 1, tileY) === chestId) {
    const leftCell = game.world.getCell(tileX - 1, tileY);
    if (leftCell.meta && leftCell.meta.chestType === 'left') owner = leftCell;
  }

  // Only a double chest if its right half is really still there.
  const ownerX = owner === cell ? tileX : tileX - 1;
  const isDouble = owner.meta.chestType === 'left' && game.world.getBlockId(ownerX + 1, tileY) === chestId;
  if (owner.meta.chestType === 'left' && !isDouble) owner.meta.chestType = 'single';
  const capacity = isDouble ? CHEST_SLOTS * 2 : CHEST_SLOTS;
  if (!Array.isArray(owner.meta.inv) || owner.meta.inv.length !== capacity) {
    // Resize, packing stacks to the front; any that don't fit (chests used to be bigger) drop out.
    const stacks = (owner.meta.inv || []).filter(Boolean);
    owner.meta.inv = Array.from({ length: capacity }, (_, i) => stacks[i] ?? null);
    for (const stack of stacks.slice(capacity)) {
      spawnItemEntity(stackId(stack), (tileX + 0.5) * TILE_SIZE, (tileY - 0.5) * TILE_SIZE, stack.count);
    }
  }

  game.openContainer = {
    title: `${isDouble ? 'Large ' : ''}${registry.get(chestId)?.displayName || 'Chest'}`,
    slots: owner.meta.inv,
    capacity,
    tileX,
    tileY,
    ownerX
  };
  game.inventoryOpen = true;
  recomputeCraft();
}

export function openFurnace(tileX, tileY) {
  const cell = game.world.getCell(tileX, tileY);
  if (!cell.meta) cell.meta = {};
  ensureFurnaceMeta(cell.meta);
  game.openContainer = { title: 'Furnace', kind: 'furnace', slots: cell.meta.inv, meta: cell.meta, capacity: cell.meta.inv.length, tileX, tileY };
  game.inventoryOpen = true;
  recomputeCraft();
}

export function openForge(tileX, tileY) {
  const cell = game.world.getCell(tileX, tileY);
  if (!cell.meta) cell.meta = {};
  if (!Array.isArray(cell.meta.inv) || cell.meta.inv.length < 2) cell.meta.inv = [cell.meta.inv?.[0] ?? null, cell.meta.inv?.[1] ?? null];
  game.openContainer = { title: 'Forging Table', kind: 'forge', slots: cell.meta.inv, meta: cell.meta, capacity: 3, choice: null, tileX, tileY };
  game.inventoryOpen = true;
  recomputeCraft();
}

// The heated head the forging table would make right now, or null.
export function forgeOutput() {
  if (game.openContainer?.kind !== 'forge') return null;
  const [hammer, ingot] = game.openContainer.slots;
  const material = heatedIngotMaterial(stackId(ingot));
  if (stackId(hammer) !== 'blacksmith_hammer' || !material || !game.openContainer.choice) return null;
  const id = `${material}_${game.openContainer.choice}_head_heated`;
  if (!registry.get(id)) return null;
  // The head keeps the ingot's heat: it cools on the same clock.
  return { ...game.inventory.createStack('item', id, 1), heatedAt: ingot.heatedAt ?? gameClock.now() };
}

// Heated metal cools back down over HEAT_COOL_MS: a heated ingot turns back into an
// ingot, a heated head into a finished head. Cooling runs on real time, so stacks left in
// chests or furnaces have cooled by the time you look at them.
const HEAT_COOL_MS = 30000;

function coolStack(stack) {
  const id = stackId(stack);
  if (!id || !id.endsWith('_heated')) return stack;
  // Missing, or a wall-clock timestamp from before the game clock: start cooling now.
  if (!stack.heatedAt || stack.heatedAt > gameClock.now()) stack.heatedAt = gameClock.now();
  if (gameClock.now() - stack.heatedAt < HEAT_COOL_MS) return stack;
  const coolId = id.slice(0, -'_heated'.length);
  if (!registry.get(coolId)) return stack;
  return game.inventory.createStack(registry.isItem(coolId) ? 'item' : 'block', coolId, stack.count);
}

function coolHeatedStacks() {
  for (let i = 0; i < game.inventory.TOTAL_SLOTS; i++) {
    const s = game.inventory.getSlot(i);
    if (s) {
      const c = coolStack(s);
      if (c !== s) game.inventory.setSlot(i, c);
    }
  }
  if (game.draggingStack) game.draggingStack = coolStack(game.draggingStack);
  const slots = game.openContainer?.slots;
  if (Array.isArray(slots)) for (let i = 0; i < slots.length; i++) if (slots[i]) slots[i] = coolStack(slots[i]);
}

export function getUIHitFromElement(element) {
  const el = element?.closest?.('.creative-tab, .creative-slot, .container-slot, .crafting-output-slot, .crafting-slot, .inventory-slot, .hotbar-slot');
  if (!el) return null;
  if (el.classList.contains('creative-tab')) return { area: 'creativeTab', tabId: el.dataset.tab };
  const index = Number(el.dataset.index);
  if (el.classList.contains('creative-slot')) return { area: 'creative', index };
  if (el.classList.contains('container-slot')) return { area: 'container', index };
  if (el.classList.contains('crafting-output-slot')) return { area: 'craftOut', index: 0 };
  if (el.classList.contains('crafting-slot')) return { area: 'craft', index };
  return { area: 'inventory', index };
}

function getActiveCraftGrid() {
  return game.openContainer?.title === 'Crafting Table' ? game.craftGrid : game.inventoryCraftGrid;
}

export function getSlotRef(area, index) {
  if (area === 'inventory') {
    if (index < 0 || index >= game.inventory.TOTAL_SLOTS) return null;
    return { get: () => game.inventory.getSlot(index), set: (v) => game.inventory.setSlot(index, v) };
  }
  if (area === 'container' && game.openContainer?.slots && game.openContainer.title !== 'Crafting Table') {
    const slots = game.openContainer.slots;
    if (index < 0 || index >= (game.openContainer.kind === 'forge' ? 3 : slots.length)) return null;
    if (game.openContainer.kind === 'forge') {
      if (index === 2) {
        // The output is worked out from the inputs; taking it uses up the ingot.
        return {
          get: forgeOutput,
          accepts: () => false,
          set: (v) => {
            if (v) return;
            const ingot = slots[1];
            if (ingot && --ingot.count <= 0) slots[1] = null;
          }
        };
      }
      const ok = index === 0 ? (st) => stackId(st) === 'blacksmith_hammer' : (st) => !!heatedIngotMaterial(stackId(st));
      return {
        get: () => slots[index] ?? null,
        accepts: ok,
        set: (v) => {
          slots[index] = v;
        }
      };
    }
    if (game.openContainer.kind === 'furnace') {
      if (index >= FURNACE_OUT && index < FURNACE_OUT + CRUCIBLES) {
        // Outputs can only be taken from, never placed into.
        return {
          get: () => slots[index] ?? null,
          accepts: () => false,
          set: (v) => {
            const cur = slots[index];
            if (!v || (cur && stackId(v) === stackId(cur) && v.count < cur.count)) slots[index] = v;
          }
        };
      }
      const ok = index === FURNACE_FUEL ? (st) => fuelTime(stackId(st)) > 0 : (st) => !!smeltingOf(stackId(st));
      return {
        get: () => slots[index] ?? null,
        accepts: ok,
        set: (v) => {
          slots[index] = v;
        }
      };
    }
    return {
      get: () => slots[index] ?? null,
      set: (v) => {
        slots[index] = v;
      }
    };
  }
  if (area === 'craft') {
    const grid = getActiveCraftGrid();
    if (index < 0 || index >= grid.length) return null;
    return {
      get: () => grid[index],
      set: (v) => {
        grid[index] = v;
      }
    };
  }
  return null;
}

function moveStackInto(stack, slots, start, end) {
  for (let i = start; i < end && stack.count > 0; i++) {
    const target = slots[i];
    if (target && game.inventory.canMerge(target, stack)) {
      const take = Math.min((target.maxStack ?? 24) - target.count, stack.count);
      if (take > 0) {
        target.count += take;
        stack.count -= take;
      }
    }
  }
  for (let i = start; i < end && stack.count > 0; i++) {
    if (!slots[i]) {
      slots[i] = { ...stack };
      stack.count = 0;
    }
  }
}

export function shiftClickTransfer(hit) {
  const ref = getSlotRef(hit.area, hit.index);
  const stack = ref?.get();
  if (!stack) return false;

  if (hit.area === 'inventory') {
    const chestSlots = game.openContainer && game.openContainer.title !== 'Crafting Table' ? game.openContainer.slots : null;
    if (game.openContainer?.kind === 'forge') {
      const id = stackId(stack);
      if (id === 'blacksmith_hammer') moveStackInto(stack, chestSlots, 0, 1);
      else if (heatedIngotMaterial(id)) moveStackInto(stack, chestSlots, 1, 2);
    } else if (game.openContainer?.kind === 'furnace') {
      // Smeltables fill the crucibles (same kind first), fuel goes in the fuel slot.
      const id = stackId(stack);
      if (smeltingOf(id)) moveStackInto(stack, chestSlots, 0, CRUCIBLES);
      else if (fuelTime(id) > 0) moveStackInto(stack, chestSlots, FURNACE_FUEL, FURNACE_FUEL + 1);
    } else if (chestSlots) moveStackInto(stack, chestSlots, 0, chestSlots.length);
    else if (hit.index < 9) moveStackInto(stack, game.inventory.slots, 9, game.inventory.TOTAL_SLOTS);
    else moveStackInto(stack, game.inventory.slots, 0, 9);
  } else {
    moveStackInto(stack, game.inventory.slots, 0, game.inventory.TOTAL_SLOTS);
  }

  if (stack.count <= 0) ref.set(null);
  recomputeCraft();
  return true;
}

export function craftAll() {
  if (!game.craftOutput || !game.craftMatch) return;
  const output = { ...game.craftOutput };
  let crafted = 0;
  for (let i = 0; i < 64; i++) {
    if (!game.craftMatch || stackId(game.craftOutput) !== stackId(output) || !consumeCraftInputs(game.craftMatch)) break;
    crafted += output.count;
    recomputeCraft();
  }
  if (crafted > 0) returnStackToInventory({ ...output, count: crafted });
  recomputeCraft();
}

export function handleInventoryClick(hit, isRightClick = false) {
  if (hit.area === 'craftOut') {
    tryPickupCraft();
    return true;
  }

  if (hit.area === 'creativeTab') {
    if (game.creativeMode && hit.tabId === CREATIVE_CLEAR_TAB) {
      // Not a real tab: empties everything you carry, like /clear.
      game.inventory.clear();
      game.draggingStack = null;
      game.inventoryCraftGrid.fill(null);
      recomputeCraft();
      if (multiplayer.isGuest) multiplayer.sendGuestSave();
      return true;
    }
    if (game.creativeMode && hit.tabId) {
      game.creativeTab = hit.tabId;
      if (game.creativeTab === CREATIVE_SEARCH_TAB) setTimeout(() => document.getElementById('creativeSearch')?.focus(), 0);
    }
    return true;
  }

  if (hit.area === 'creative') {
    if (!game.creativeMode) return false;
    const item = getCreativeTabItems(game.creativeTab)[hit.index];
    if (!item) return false;
    if (game.draggingStack && game.inventory.canMerge(game.draggingStack, item)) {
      game.draggingStack.count = Math.min(game.draggingStack.maxStack ?? 24, game.draggingStack.count + 1);
    } else if (game.draggingStack) {
      // Dropping something else on the creative menu throws it away.
      game.draggingStack = null;
    } else {
      game.draggingStack = { ...item, count: isRightClick ? 1 : (item.maxStack ?? 24) };
    }
    return true;
  }

  const slotRef = getSlotRef(hit.area, hit.index);
  if (!slotRef) return false;
  const slot = slotRef.get();

  // A slot that won't take what you're holding (a furnace or forge output, a forge input
  // for something else): click it to scoop up its contents onto your stack if they match.
  if (game.draggingStack && slotRef.accepts && !slotRef.accepts(game.draggingStack)) {
    if (slot && game.inventory.canMerge(slot, game.draggingStack) && game.draggingStack.count + slot.count <= (game.draggingStack.maxStack ?? 24)) {
      game.draggingStack.count += slot.count;
      slotRef.set(null);
    }
    return true;
  }

  if (!game.draggingStack) {
    if (!slot) return false;
    if (isRightClick && slot.count > 1) {
      const take = Math.ceil(slot.count / 2);
      game.draggingStack = { ...slot, count: take };
      slot.count -= take;
    } else {
      game.draggingStack = slot;
      slotRef.set(null);
    }
  } else if (!slot) {
    if (isRightClick) {
      slotRef.set({ ...game.draggingStack, count: 1 });
      game.draggingStack.count -= 1;
    } else {
      slotRef.set(game.draggingStack);
      game.draggingStack = null;
    }
  } else if (game.inventory.canMerge(slot, game.draggingStack)) {
    const room = (slot.maxStack ?? 24) - slot.count;
    const take = Math.min(room, isRightClick ? 1 : game.draggingStack.count);
    slot.count += take;
    game.draggingStack.count -= take;
  } else {
    slotRef.set(game.draggingStack);
    game.draggingStack = slot;
  }

  if (game.draggingStack && game.draggingStack.count <= 0) game.draggingStack = null;
  recomputeCraft();
  return true;
}

export function updateSlot(slot, stack, isSelected) {
  const id = stackId(stack);
  if (id) {
    let img = slot.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.draggable = false;
      img.onerror = () => {
        img.onerror = null;
        img.src = 'assets/textures/stone.png';
      };
      slot.appendChild(img);
    }
    const src = game.renderer.biomeIconSrc?.(id) || `assets/textures/${id}.png`;
    if (img.dataset.src !== src) {
      img.dataset.src = src;
      img.src = src;
    }
    let countSpan = slot.querySelector('.item-count');
    if (stack.count > 1) {
      if (!countSpan) {
        countSpan = document.createElement('span');
        countSpan.className = 'item-count';
        slot.appendChild(countSpan);
      }
      countSpan.textContent = stack.count;
    } else if (countSpan) {
      countSpan.remove();
    }
    slot.classList.add('has-item');
    slot.title = stack.displayName || id;
    // Heated metal shows how much heat it has left.
    let heat = slot.querySelector('.heat-bar');
    if (stack.heatedAt && id.endsWith('_heated')) {
      if (!heat) {
        heat = document.createElement('div');
        heat.className = 'heat-bar';
        heat.appendChild(document.createElement('div'));
        slot.appendChild(heat);
      }
      heat.firstChild.style.width = `${Math.max(0, 100 - ((gameClock.now() - stack.heatedAt) / HEAT_COOL_MS) * 100)}%`;
    } else if (heat) heat.remove();
  } else if (slot.firstChild) {
    slot.innerHTML = '';
    slot.classList.remove('has-item');
    slot.title = '';
  }
  slot.classList.toggle('selected', !!isSelected);
}

function updateOverlaySlots(overlay) {
  for (const slotEl of overlay.querySelectorAll('.inventory-slot:not(.container-slot):not(.creative-slot), .hotbar-slot')) {
    const idx = Number(slotEl.dataset.index);
    updateSlot(slotEl, slotForDisplay(idx), idx === game.selectedIndex && slotEl.classList.contains('hotbar-slot'));
  }
  const grid = getActiveCraftGrid();
  for (const slotEl of overlay.querySelectorAll('.crafting-slot')) {
    updateSlot(slotEl, grid[Number(slotEl.dataset.index)], false);
  }
  const outSlot = overlay.querySelector('.crafting-output-slot');
  if (outSlot) updateSlot(outSlot, game.craftOutput, false);
}

function getCreativeCategoriesCached() {
  if (!game.creativeCategoriesCache) game.creativeCategoriesCache = game.inventory.getCreativeCategories();
  return game.creativeCategoriesCache;
}

const CREATIVE_SEARCH_TAB = 'search';

const CREATIVE_INVENTORY_TAB = 'inventory';

const CREATIVE_CLEAR_TAB = 'clear';

function getCreativeTabItems(tabId) {
  const categories = getCreativeCategoriesCached();
  if (tabId === CREATIVE_SEARCH_TAB) {
    const all = Object.values(categories).flatMap((category) => category.items);
    if (!game.creativeSearchQuery) return all;
    return all.filter((item) => `${item.displayName || ''} ${stackId(item)}`.toLowerCase().includes(game.creativeSearchQuery));
  }
  return categories[tabId]?.items || [];
}

function createCreativeTab(tabId, name, iconId) {
  const tab = document.createElement('button');
  tab.className = 'creative-tab';
  tab.dataset.tab = tabId;
  tab.title = name;
  const img = document.createElement('img');
  img.draggable = false;
  img.src = `assets/textures/${iconId}.png`;
  img.onerror = () => {
    img.onerror = null;
    img.src = 'assets/textures/stone.png';
  };
  tab.appendChild(img);
  return tab;
}

function updateCreativePanel() {
  const overlay = document.getElementById('inventory');
  const panel = document.getElementById('creativePanel');
  if (!panel || !overlay) return;
  overlay.classList.toggle('creative-mode', game.creativeMode);
  panel.classList.toggle('hidden', !game.creativeMode || game.creativeTab === CREATIVE_INVENTORY_TAB);
  if (!game.creativeMode) return;

  const categories = getCreativeCategoriesCached();
  const virtualTabs = [CREATIVE_SEARCH_TAB, CREATIVE_INVENTORY_TAB];
  if (!categories[game.creativeTab] && !virtualTabs.includes(game.creativeTab)) game.creativeTab = Object.keys(categories)[0];
  overlay.dataset.creativeTab = game.creativeTab;

  const tabs = document.getElementById('creativeTabs');
  const bottomTabs = document.getElementById('creativeTabsBottom');
  if (tabs && !tabs.childElementCount) {
    for (const [tabId, category] of Object.entries(categories)) {
      tabs.appendChild(createCreativeTab(tabId, category.name, category.icon || stackId(category.items[0]) || 'stone'));
    }
    const search = createCreativeTab(CREATIVE_SEARCH_TAB, 'Search Items', 'stick');
    search.classList.add('creative-tab-search');
    tabs.appendChild(search);
  }
  if (bottomTabs && !bottomTabs.childElementCount) {
    // An X that empties the whole inventory, left of the inventory tab.
    const clear = document.createElement('button');
    clear.className = 'creative-tab creative-tab-clear';
    clear.dataset.tab = CREATIVE_CLEAR_TAB;
    clear.title = 'Clear Inventory';
    clear.innerHTML =
      '<svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M1 1h1v1H1zM2 2h1v1H2zM3 3h2v2H3zM5 2h1v1H5zM6 1h1v1H6zM2 5h1v1H2zM1 6h1v1H1zM5 5h1v1H5zM6 6h1v1H6z"/></svg>';
    bottomTabs.appendChild(clear);
    const survival = createCreativeTab(CREATIVE_INVENTORY_TAB, 'Inventory', 'oak_chest');
    survival.classList.add('creative-tab-inventory');
    bottomTabs.appendChild(survival);
  }
  for (const tab of document.querySelectorAll('#inventory .creative-tab')) {
    tab.classList.toggle('selected', tab.dataset.tab === game.creativeTab);
  }

  const title = document.getElementById('creativeTitle');
  if (title) {
    title.textContent = game.creativeTab === CREATIVE_SEARCH_TAB ? 'Search Items' : categories[game.creativeTab]?.name || '';
  }

  const grid = document.getElementById('creativeGrid');
  if (grid && (game.renderedCreativeTab !== game.creativeTab || game.renderedCreativeQuery !== game.creativeSearchQuery)) {
    if (game.renderedCreativeTab !== game.creativeTab) grid.scrollTop = 0;
    game.renderedCreativeTab = game.creativeTab;
    game.renderedCreativeQuery = game.creativeSearchQuery;
    grid.innerHTML = '';
    const items = getCreativeTabItems(game.creativeTab);
    const slotCount = Math.max(45, Math.ceil(items.length / 9) * 9);
    for (let index = 0; index < slotCount; index++) {
      const slot = document.createElement('div');
      slot.className = 'inventory-slot creative-slot';
      slot.dataset.index = index;
      if (items[index]) updateSlot(slot, items[index], false);
      grid.appendChild(slot);
    }
  }
}

export function shiftClickCreative(index) {
  if (!game.creativeMode) return;
  const item = getCreativeTabItems(game.creativeTab)[index];
  if (!item) return;
  addStackToInventory({ ...item, count: item.maxStack ?? 24 });
}

export function bindCreativeSearch() {
  const input = document.getElementById('creativeSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    game.creativeSearchQuery = input.value.trim().toLowerCase();
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.code === 'Escape' || e.code === 'Enter') input.blur();
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
}

// The Type / Material switch in the creative menu's top right.
export function syncCreativeSort() {
  for (const b of document.querySelectorAll('#creativeSort button')) b.classList.toggle('selected', b.dataset.sort === game.creativeSortMode);
}

export function bindCreativeSort() {
  const box = document.getElementById('creativeSort');
  if (!box) return;
  box.addEventListener('mousedown', (e) => e.stopPropagation());
  box.addEventListener('click', (e) => {
    e.stopPropagation();
    const mode = e.target.closest('button')?.dataset.sort;
    if (!mode || mode === game.creativeSortMode) return;
    game.creativeSortMode = mode;
    prefs.set('creativeSort', mode);
    game.creativeCategoriesCache = null;
    game.renderedCreativeTab = null; // redraw the grid in the new order
    syncCreativeSort();
  });
  syncCreativeSort();
}

// Crafts once; if fly is set, the result's icon zips from the recipe row to the slot it
// landed in. Returns false if it couldn't craft.
// Slots whose new contents are still flying in: they keep showing what they had until the
// icon lands. index -> { shown: stack (copy), token }
export const pendingSlots = new Map();

function slotForDisplay(i) {
  return pendingSlots.has(i) ? pendingSlots.get(i).shown : game.inventory.getSlot(i);
}

function buildContainerSlots(capacity) {
  const grid = document.getElementById('chestGrid');
  if (!grid || grid.childElementCount === capacity) return;
  grid.innerHTML = '';
  for (let i = 0; i < capacity; i++) {
    const slot = document.createElement('div');
    slot.className = 'inventory-slot container-slot';
    slot.dataset.index = i;
    grid.appendChild(slot);
  }
}

export function updateHTMLUI() {
  game.htmlUIFrameCounter++;
  if (game.htmlUIFrameCounter % 3 !== 0) return;

  const inGame = !!(game.world && game.player && game.inventory) && !isAnyMenuVisible();
  const isCraftingTable = game.openContainer?.title === 'Crafting Table';
  const isFurnace = game.openContainer?.kind === 'furnace';
  const isForge = game.openContainer?.kind === 'forge';
  const isChest = !!game.openContainer && !isCraftingTable && !isFurnace && !isForge;
  ensureFurnaceUI();
  ensureForgeUI();
  ensureRecipeLists();
  if (game.htmlUIFrameCounter % 15 === 0 && inGame) coolHeatedStacks();

  const hotbar = document.getElementById('hotbar');
  if (hotbar) {
    hotbar.classList.toggle('hidden', !inGame || game.inventoryOpen || !!game.openContainer);
    if (inGame) {
      for (const slotEl of hotbar.querySelectorAll('.hotbar-slot')) {
        const idx = Number(slotEl.dataset.index);
        updateSlot(slotEl, game.inventory.getSlot(idx), idx === game.selectedIndex);
      }
    }
  }

  const overlays = {
    inventory: inGame && game.inventoryOpen && !game.openContainer,
    craftingTable: inGame && isCraftingTable,
    chestUI: inGame && isChest,
    furnaceUI: inGame && isFurnace,
    forgeUI: inGame && isForge
  };
  for (const [id, visible] of Object.entries(overlays)) {
    const overlay = document.getElementById(id);
    if (!overlay) continue;
    overlay.classList.toggle('hidden', !visible);
    if (!visible) continue;
    if (id === 'inventory') updateCreativePanel();
    if (id === 'inventory' || id === 'craftingTable') updateRecipeList(overlay, id === 'craftingTable');
    if (id === 'inventory') keepCreativeHeight(overlay);
    if (id === 'furnaceUI') updateFurnaceUI(overlay);
    if (id === 'forgeUI') updateForgeUI(overlay);
    if (id === 'chestUI') {
      const title = document.getElementById('chestTitle');
      if (title) title.textContent = game.openContainer.title;
      buildContainerSlots(game.openContainer.capacity);
      for (const slotEl of overlay.querySelectorAll('.container-slot')) {
        updateSlot(slotEl, game.openContainer.slots[Number(slotEl.dataset.index)], false);
      }
    }
    updateOverlaySlots(overlay);
  }

  const draggingDiv = document.getElementById('dragging-item');
  if (draggingDiv) {
    const showDrag = !!game.draggingStack && (game.inventoryOpen || !!game.openContainer);
    draggingDiv.classList.toggle('hidden', !showDrag);
    if (showDrag) updateSlot(draggingDiv, game.draggingStack, false);
  }

  perfOverlay.update(inGame);

  const fpsCounter = document.getElementById('fpsCounter');
  if (fpsCounter) fpsCounter.textContent = `FPS: ${game.renderer.fps}`;

  const chatArea = document.getElementById('chatArea');
  const chatLog = document.getElementById('chatLog');
  const hasVisibleChat = !!(
    game.textInputMode ||
    chatArea?.classList.contains('chat-open') ||
    (chatLog && Array.from(chatLog.children).some((line) => !line.classList.contains('gone') && !line.classList.contains('faded')))
  );

  const coordinates = document.getElementById('coordinates');
  if (coordinates) coordinates.classList.toggle('hidden', !inGame || hasVisibleChat);
  if (chatArea) chatArea.classList.toggle('hidden', !inGame);
  const coordText = document.getElementById('coordText');
  if (coordText && inGame) {
    const px = Math.floor((game.player.x + game.player.width / 2) / TILE_SIZE);
    const py = Math.floor((game.player.y + game.player.height / 2) / TILE_SIZE);
    coordText.textContent = `X: ${px} Y: ${py}`;
  }

  // Hidden behind the inventory and other screens.
  const showStats = inGame && !game.creativeMode && !game.inventoryOpen && !game.openContainer;
  const healthDisplay = document.getElementById('healthDisplay');
  if (healthDisplay) healthDisplay.classList.toggle('hidden', !showStats);
  const hungerDisplay = document.getElementById('hungerDisplay');
  if (hungerDisplay) hungerDisplay.classList.toggle('hidden', !showStats);
  if (showStats) {
    renderStatIcons(healthDisplay, 'heart', game.player.health, game.player.maxHealth);
    renderStatIcons(hungerDisplay, 'hunger', game.player.hunger, game.player.maxHunger);
  }
}

function renderStatIcons(container, kind, value, max) {
  if (!container) return;
  const key = `${Math.ceil(value)}/${max}`;
  if (container.dataset.state === key) return;
  container.dataset.state = key;
  const icons = Math.ceil(max / 2);
  const points = Math.ceil(value);
  container.textContent = '';
  for (let i = 0; i < icons; i++) {
    const remaining = points - i * 2;
    const fill = remaining >= 2 ? 'full' : remaining === 1 ? 'half' : 'empty';
    const icon = document.createElement('span');
    icon.className = `stat-icon ${kind} ${fill}`;
    container.appendChild(icon);
  }
}
