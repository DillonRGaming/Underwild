// Crafting: the "can make" recipe list, and the furnace and forging table windows.
//
// No crafting grid: the inventory (and crafting table) list everything you can make from
// what you carry. Hold the mouse on a recipe: a line sweeps across the row, then it crafts and
// the item zips into your inventory; keep holding to keep crafting. Shift-click crafts as many
// as you can at once.
import { CRUCIBLES, OUT as FURNACE_OUT, FUEL as FURNACE_FUEL, ensureFurnaceMeta, crucibleRecipe, crucibleState } from '../../assets/blocks/furnace.js';
import { HEAD_TYPES, heatedIngotMaterial } from '../../assets/blocks/forging_table.js';
import { itemMatchesIngredient, recipeNeeds, createRecipeOutput, getAllRecipes, fitsSmallGrid } from '../logic/crafting.js';
import { registry } from '../game/content.js';
import { updateSlot, stackId, forgeOutput, returnStackToInventory, pendingSlots } from './inventoryUI.js';
import { game } from '../game/state.js';

// The furnace window: the fuel slot on the left with a line showing how much of the current
// fuel is left, then the four crucibles in a row with their outputs underneath. Under each
// crucible a thin bar shows its cooking progress.
export function ensureFurnaceUI() {
  if (document.getElementById('furnaceUI')) return;
  const chest = document.getElementById('chestUI');
  if (!chest) return;
  const ui = chest.cloneNode(true);
  ui.id = 'furnaceUI';
  ui.classList.add('hidden');
  ui.querySelector('#chestTitle').id = 'furnaceTitle';
  ui.querySelector('#furnaceTitle').textContent = 'Furnace';
  const crucibles = Array.from(
    { length: CRUCIBLES },
    (_, i) => `
    <div class="furnace-cell crucible" data-crucible="${i}">
      <div class="inventory-slot container-slot" data-index="${i}"></div>
      <div class="furnace-bar"><div></div></div>
    </div>`
  ).join('');
  const outputs = Array.from(
    { length: CRUCIBLES },
    (_, i) => `
    <div class="furnace-cell out"><div class="inventory-slot container-slot" data-index="${FURNACE_OUT + i}"></div></div>`
  ).join('');
  const area = document.createElement('div');
  area.className = 'furnace-layout';
  area.innerHTML = `
    <div class="furnace-cell fuel">
      <div class="inventory-slot container-slot" data-index="${FURNACE_FUEL}"></div>
      <div class="furnace-bar fuel-bar"><div></div></div>
    </div>
    <div class="furnace-grid">${crucibles}${outputs}</div>`;
  ui.querySelector('#chestGrid').replaceWith(area);
  chest.after(ui);
}

export function updateFurnaceUI(overlay) {
  const m = ensureFurnaceMeta(game.openContainer.meta);
  for (const slotEl of overlay.querySelectorAll('.container-slot')) {
    updateSlot(slotEl, m.inv[Number(slotEl.dataset.index)], false);
  }
  for (const el of overlay.querySelectorAll('.furnace-cell.crucible')) {
    const i = Number(el.dataset.crucible);
    const r = crucibleRecipe(m, i);
    el.dataset.state = crucibleState(m, i, registry);
    el.querySelector('.furnace-bar > div').style.width = `${r ? Math.round(Math.min(1, m.cook[i] / r[1]) * 100) : 0}%`;
    el.title = r ? `Makes ${registry.get(r[0])?.displayName || r[0]}` : 'Ore, raw ore or an ingot';
  }
  const fuel = overlay.querySelector('.furnace-cell.fuel');
  fuel.querySelector('.furnace-bar > div').style.width = `${m.burnMax > 0 ? Math.round((m.burn / m.burnMax) * 100) : 0}%`;
  fuel.title = m.burn > 0 ? `Burning ${registry.get(m.burnId)?.displayName || 'fuel'}` : 'Fuel: coal or anything wooden';
}

// The forging table window, laid out like a cartography table: hammer over ingot on the
// left, an arrow, a big panel listing the heads that ingot can become, and the output.
export function ensureForgeUI() {
  if (document.getElementById('forgeUI')) return;
  const chest = document.getElementById('chestUI');
  if (!chest) return;
  const ui = chest.cloneNode(true);
  ui.id = 'forgeUI';
  ui.classList.add('hidden');
  ui.querySelector('#chestTitle').id = 'forgeTitle';
  ui.querySelector('#forgeTitle').textContent = 'Forging Table';
  const area = document.createElement('div');
  area.className = 'forge-area';
  area.innerHTML = `
    <div class="forge-inputs">
      <div class="inventory-slot container-slot" data-index="0" title="Blacksmith Hammer"></div>
      <div class="forge-plus">+</div>
      <div class="inventory-slot container-slot" data-index="1" title="Heated Ingot"></div>
    </div>
    <div class="forge-arrow"></div>
    <div class="forge-panel"><div class="forge-hint"></div><div class="forge-choices"></div></div>
    <div class="inventory-slot container-slot forge-output" data-index="2" title="Output"></div>`;
  ui.querySelector('#chestGrid').replaceWith(area);
  const choices = area.querySelector('.forge-choices');
  for (const type of HEAD_TYPES) {
    const el = document.createElement('div');
    el.className = 'forge-choice';
    el.dataset.type = type;
    choices.appendChild(el);
  }
  choices.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.forge-choice');
    if (!el || el.classList.contains('disabled') || game.openContainer?.kind !== 'forge') return;
    e.stopPropagation();
    game.openContainer.choice = game.openContainer.choice === el.dataset.type ? null : el.dataset.type;
  });
  chest.after(ui);
}

export function updateForgeUI(overlay) {
  const [hammer, ingot] = game.openContainer.slots;
  for (const slotEl of overlay.querySelectorAll('.container-slot')) {
    const i = Number(slotEl.dataset.index);
    updateSlot(slotEl, i === 2 ? forgeOutput() : game.openContainer.slots[i], false);
  }
  const material = heatedIngotMaterial(stackId(ingot));
  const hasHammer = stackId(hammer) === 'blacksmith_hammer';
  const hint = overlay.querySelector('.forge-hint');
  hint.textContent =
    !hasHammer && !material
      ? 'Add a blacksmith hammer and a heated ingot'
      : !hasHammer
        ? 'Add a blacksmith hammer'
        : !material
          ? 'Add a heated ingot'
          : game.openContainer.choice
            ? ''
            : 'Pick a head to forge';
  for (const el of overlay.querySelectorAll('.forge-choice')) {
    const id = `${material || 'copper'}_${el.dataset.type}_head`;
    const ok = !!material && hasHammer && !!registry.get(`${id}_heated`);
    el.classList.toggle('disabled', !ok);
    el.classList.toggle('selected', ok && game.openContainer.choice === el.dataset.type);
    updateSlot(el, registry.get(id) ? game.inventory.createStack('item', id, 1) : null, false);
    el.title = registry.get(id)?.displayName || el.dataset.type;
  }
}

// How long one craft takes: bigger recipes take longer (a crafting table ~0.7s, a furnace ~1.1s).
// Shift-hold crafts everything at once, so its sweep takes twice as long.
export function holdMs(hold) {
  return craftMsFor(hold.entry) * (hold.all ? 2 : 1);
}

function craftMsFor(entry) {
  const parts = entry.entries.reduce((n, x) => n + x.n, 0);
  return Math.max(300, Math.min(1800, 250 + 110 * parts));
}

const CRAFT_PAUSE_MS = 150; // beat between crafts while holding

function inventoryCount(ingredient) {
  let n = 0;
  for (let i = 0; i < game.inventory.TOTAL_SLOTS; i++) {
    const s = game.inventory.getSlot(i);
    if (s && itemMatchesIngredient(stackId(s), ingredient)) n += s.count;
  }
  return n;
}

function canCraftRecipe(recipe) {
  const needs = recipeNeeds(recipe);
  return Object.entries(needs).every(([id, n]) => inventoryCount(id) >= n);
}

function craftRecipeFromInventory(recipe) {
  if (!game.creativeMode && !canCraftRecipe(recipe)) return false;
  if (!game.creativeMode) {
    for (const [id, n] of Object.entries(recipeNeeds(recipe))) {
      let left = n;
      for (let i = 0; i < game.inventory.TOTAL_SLOTS && left > 0; i++) {
        const s = game.inventory.getSlot(i);
        if (!s || !itemMatchesIngredient(stackId(s), id)) continue;
        const take = Math.min(left, s.count);
        s.count -= take;
        left -= take;
        if (s.count <= 0) game.inventory.setSlot(i, null);
      }
    }
  }
  returnStackToInventory(createRecipeOutput(recipe, registry));
  return true;
}

// Recipes to show: everything you can make now, then a few you're close to (greyed).
function recipeEntries(bigTable) {
  const seen = new Set();
  const ready = [],
    close = [];
  for (const recipe of getAllRecipes()) {
    if (!bigTable && !fitsSmallGrid(recipe)) continue;
    const outId = recipe.out.blockId || recipe.out.itemId;
    if (!registry.get(outId)) continue;
    const needs = recipeNeeds(recipe);
    const key = outId + JSON.stringify(needs);
    if (seen.has(key)) continue;
    seen.add(key);
    const entries = Object.entries(needs).map(([id, n]) => ({ id, n, have: inventoryCount(id) }));
    if (entries.every((e) => e.have >= e.n)) ready.push({ recipe, outId, entries, ok: true, key });
    else if (entries.some((e) => e.have > 0)) close.push({ recipe, outId, entries, ok: false, key });
  }
  return [...ready, ...close.slice(0, 8)];
}

// A real item id for an ingredient group like 'planks', for its icon.
function ingredientIcon(id) {
  if (registry.get(id)) return id;
  for (let i = 0; i < game.inventory.TOTAL_SLOTS; i++) {
    const s = game.inventory.getSlot(i);
    if (s && itemMatchesIngredient(stackId(s), id)) return stackId(s);
  }
  return id === 'planks' ? 'oak_planks' : id === 'wood' ? 'oak_log' : 'stone';
}

export function ensureRecipeLists() {
  for (const id of ['inventory', 'craftingTable']) {
    const overlay = document.getElementById(id);
    if (!overlay || overlay.querySelector('.recipe-panel')) continue;
    const grid = overlay.querySelector('.crafting-grid');
    if (!grid) continue;
    grid.classList.add('hidden');
    const panel = document.createElement('div');
    panel.className = 'recipe-panel';
    panel.innerHTML = '<div class="recipe-list"></div>';
    grid.after(panel);
    const list = panel.querySelector('.recipe-list');
    list.addEventListener('mousedown', (e) => {
      const row = e.target.closest('.recipe-row');
      if (!row || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const entry = list._entries?.find((x) => x.key === row.dataset.key);
      if (!entry || !entry.ok) return;
      // Shift still shows the sweep; when it finishes it crafts as many as it can.
      game.recipeHold = { key: entry.key, entry, overlay, start: performance.now(), all: e.shiftKey };
    });
    list.addEventListener('mouseleave', () => {
      game.recipeHold = null;
    });
    // Phones: a touch only becomes a mouse press when it ends, so holding never worked.
    // Hold on a recipe with your finger instead; lifting it stops. Dragging scrolls the list
    // (by hand, since the touch's default is turned off to stop the long-press menu).
    // A touch's later events all go to the element it started on, even once that row has been
    // redrawn away after a craft (and then they no longer reach the list or the window), so
    // they're listened for on that row itself.
    list.addEventListener(
      'touchstart',
      (e) => {
        const row = e.target.closest('.recipe-row');
        if (!row) return;
        e.preventDefault();
        e.stopPropagation();
        const touch = e.changedTouches[0];
        let lastY = touch.clientY;
        const mine = (ev) => [...ev.changedTouches].some((t) => t.identifier === touch.identifier);
        const move = (ev) => {
          if (!mine(ev)) return;
          const y = [...ev.changedTouches].find((t) => t.identifier === touch.identifier).clientY;
          if (game.recipeHold && Math.abs(y - lastY) < 10) return;
          game.recipeHold = null;
          list.scrollTop -= y - lastY;
          lastY = y;
        };
        const end = (ev) => {
          if (!mine(ev)) return;
          game.recipeHold = null;
          e.target.removeEventListener('touchmove', move);
          e.target.removeEventListener('touchend', end);
          e.target.removeEventListener('touchcancel', end);
        };
        e.target.addEventListener('touchmove', move, { passive: true });
        e.target.addEventListener('touchend', end);
        e.target.addEventListener('touchcancel', end);
        const entry = list._entries?.find((x) => x.key === row.dataset.key);
        if (!entry || !entry.ok) return;
        game.recipeHold = { key: entry.key, entry, overlay, start: performance.now(), all: false };
      },
      { passive: false }
    );
  }
}

// Inventory slot index -> what's in it, to spot where a crafted item landed.
function inventorySnapshot() {
  return Array.from({ length: game.inventory.TOTAL_SLOTS }, (_, i) => {
    const st = game.inventory.getSlot(i);
    return st ? `${stackId(st)}:${st.count}` : '';
  });
}

function craftWithFlight(overlay, entry, fly = true) {
  const beforeStacks = Array.from({ length: game.inventory.TOTAL_SLOTS }, (_, i) => {
    const st = game.inventory.getSlot(i);
    return st ? { ...st } : null;
  });
  const before = inventorySnapshot();
  if (!craftRecipeFromInventory(entry.recipe)) return false;
  if (!fly) return true;
  const after = inventorySnapshot();
  const landed = after.findIndex((v, i) => v !== before[i] && v.startsWith(entry.outId + ':'));
  const from = overlay.querySelector(`.recipe-row[data-key="${CSS.escape(entry.key)}"] > img`);
  // The visible slot it landed in (hidden copies of the same slot report a 0x0 box at the
  // top left of the page).
  const to =
    landed >= 0
      ? [
          ...overlay.querySelectorAll(`.inventory-slot[data-index="${landed}"]:not(.container-slot):not(.creative-slot), .hotbar-slot[data-index="${landed}"]`)
        ].find((el) => el.getBoundingClientRect().width > 0)
      : null;
  if (!from || !to) return true;
  // Keep showing the slot's old contents (or the oldest still-pending ones) until landing.
  const token = {};
  pendingSlots.set(landed, { shown: pendingSlots.get(landed)?.shown ?? beforeStacks[landed], token });
  const a = from.getBoundingClientRect(),
    b = to.getBoundingClientRect();
  const ghost = from.cloneNode();
  ghost.className = 'craft-flyer';
  Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.appendChild(ghost);
  const size = Math.min(b.width, b.height) * 0.7;
  requestAnimationFrame(() => {
    ghost.style.transform = `translate(${b.left + (b.width - size) / 2 - a.left}px, ${b.top + (b.height - size) / 2 - a.top}px) scale(${size / a.width})`;
  });
  setTimeout(() => {
    ghost.remove();
    if (pendingSlots.get(landed)?.token === token) pendingSlots.delete(landed);
    to.classList.remove('craft-landed');
    void to.offsetWidth;
    to.classList.add('craft-landed');
  }, 260);
  return true;
}

// In creative every tab keeps the same window height: the item tabs set it, and the
// inventory tab (recipe list) and search tab (search box) fit inside it by shrinking their
// scrolling part, so the tab buttons never jump.
export function keepCreativeHeight(overlay) {
  const content = overlay.querySelector('.inventory-content');
  const list = overlay.querySelector('.recipe-list');
  const grid = overlay.querySelector('.creative-grid');
  if (!content || !list || !grid) return;
  const tab = overlay.dataset.creativeTab;
  const reset = () => {
    content.style.height = '';
    list.style.height = '';
    grid.style.height = '';
  };
  if (!game.creativeMode) return reset();
  if (tab !== 'inventory' && tab !== 'search') {
    reset();
    if (content.offsetHeight) overlay._creativeHeight = content.offsetHeight;
    return;
  }
  const target = overlay._creativeHeight;
  if (!target) return;
  content.style.height = `${target}px`;
  const fit = tab === 'inventory' ? list : grid;
  const extra = content.scrollHeight - content.clientHeight;
  if (Math.abs(extra) > 1) fit.style.height = `${Math.max(40, fit.getBoundingClientRect().height - extra)}px`;
}

export function updateRecipeList(overlay, bigTable) {
  const list = overlay.querySelector('.recipe-list');
  if (!list) return;
  const entries = recipeEntries(bigTable);
  const sig = entries.map((e) => e.key + e.ok + e.entries.map((x) => x.have).join(',')).join('|');
  if (list._sig !== sig) {
    list._sig = sig;
    list._entries = entries;
    const icon = (id) => `<img src="${game.renderer.biomeIconSrc?.(id) || `assets/textures/${id}.png`}" alt="" draggable="false">`;
    list.innerHTML = entries.length
      ? entries
          .map((e) => {
            const name = registry.get(e.outId)?.displayName || e.outId;
            const count = e.recipe.out.count > 1 ? ` x${e.recipe.out.count}` : '';
            const parts = e.entries
              .map(
                (x) =>
                  `<span class="recipe-part ${x.have >= x.n ? '' : 'missing'}">${icon(ingredientIcon(x.id))}<span class="recipe-count">${x.n}</span></span>`
              )
              .join('');
            return `<div class="recipe-row ${e.ok ? '' : 'locked'}" data-key="${e.key.replace(/"/g, '&quot;')}" title="${e.ok ? 'Hold to craft, shift-hold to craft all' : 'Missing ingredients'}">
        ${icon(e.outId)}<span class="recipe-name">${name}${count}</span><span class="recipe-parts">${parts}</span></div>`;
          })
          .join('')
      : '';
  }
  // The sweep line on the row being held; craft when it reaches the right.
  const now = performance.now();
  for (const row of list.querySelectorAll('.recipe-row')) {
    const held = game.recipeHold && game.recipeHold.overlay === overlay && row.dataset.key === game.recipeHold.key;
    if (!held) row.style.setProperty('--craft', '0');
    row.classList.toggle('holding', !!held);
  }
  if (game.recipeHold && game.recipeHold.overlay === overlay && now - game.recipeHold.start >= holdMs(game.recipeHold)) {
    if (game.recipeHold.all) {
      let crafted = 0;
      while (crafted < 64 && craftWithFlight(overlay, game.recipeHold.entry, crafted === 0)) crafted++;
      game.recipeHold = null;
    } else if (craftWithFlight(overlay, game.recipeHold.entry)) {
      game.recipeHold.start = now + CRAFT_PAUSE_MS;
    } else {
      game.recipeHold = null;
    }
  }
}
