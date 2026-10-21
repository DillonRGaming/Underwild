// The player's inventory: 27 slots, the first 9 the hotbar.
import { migrateLegacyId } from '../core/legacyIds.js';
import { compareForCreative, creativeTabFor } from '../data/sorting.js';
import { game } from '../game/state.js';

export class Inventory {
  constructor(registry) {
    this.registry = registry;
    this.HOTBAR_SIZE = 9;
    this.TOTAL_SLOTS = 27; // hotbar + 2 rows
    this.slots = Array.from({ length: this.TOTAL_SLOTS }, () => null);
  }

  getSlot(i) {
    return this.slots[i] ?? null;
  }

  setSlot(i, stack) {
    this.slots[i] = stack;
  }

  takeSlot(i) {
    const s = this.slots[i];
    this.slots[i] = null;
    return s;
  }

  clear() {
    this.slots.fill(null);
  }

  canMerge(a, b) {
    if (!a || !b || a.type !== b.type) return false;
    if (a.type === 'block') return a.blockId === b.blockId;
    if (a.type === 'item') return a.itemId === b.itemId;
    return false;
  }

  createStack(type, id, count) {
    const def = this.registry.get(id);
    return {
      type,
      [type === 'item' ? 'itemId' : 'blockId']: id,
      displayName: def?.displayName || id.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      count,
      maxStack: def?.maxStack ?? 24
    };
  }

  // heatedAt: when heated metal was heated (it cools from then); stacks joined keep the
  // earliest, so nothing stays hot longer than it should.
  add(type, id, count, heatedAt = null) {
    const template = this.createStack(type, id, 0);
    if (heatedAt != null) template.heatedAt = heatedAt;
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      const s = this.slots[i];
      if (s && this.canMerge(s, template) && s.count < (s.maxStack ?? 24)) {
        const take = Math.min((s.maxStack ?? 24) - s.count, count);
        s.count += take;
        count -= take;
        if (heatedAt != null) s.heatedAt = s.heatedAt == null ? heatedAt : Math.min(s.heatedAt, heatedAt);
      }
    }
    for (let i = 0; i < this.TOTAL_SLOTS && count > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(template.maxStack, count);
        this.slots[i] = { ...template, count: take };
        count -= take;
      }
    }
    return count;
  }

  addBlock(blockId, count = 1) {
    return this.add('block', blockId, count);
  }

  addItem(itemId, count = 1) {
    return this.add('item', itemId, count);
  }

  addById(id, count = 1) {
    return this.registry.isItem(id) ? this.addItem(id, count) : this.addBlock(id, count);
  }

  getCreativeCategories() {
    const categories = {
      building: { name: 'Building', items: [] },
      nature: { name: 'Nature', icon: 'grass', items: [] },
      tools: { name: 'Tools', icon: 'gold_sword', items: [] },
      materials: { name: 'Materials', items: [] },
      functional: { name: 'Functional', icon: 'crafting_table', items: [] }
    };

    // Each block and item says its own material, kind and tab (see src/data/sorting.js).
    const entries = [];
    for (const [id, def] of this.registry.entries()) {
      if (def.hidden || id === 'hand') continue;
      entries.push({ def, stack: this.createStack(def.isItem ? 'item' : 'block', id, 1) });
    }
    entries.sort((a, b) => compareForCreative(a.def, b.def, game.creativeSortMode));
    for (const { def, stack } of entries) {
      (categories[creativeTabFor(def, game.creativeSortMode)] ?? categories.building).items.push(stack);
    }
    return categories;
  }

  serialize() {
    return this.slots.map((s) => {
      if (!s) return null;
      return { type: s.type, blockId: s.blockId, itemId: s.itemId, count: s.count, ...(s.heatedAt != null ? { heatedAt: s.heatedAt } : {}) };
    });
  }

  deserialize(data) {
    this.clear();
    if (!Array.isArray(data)) return;
    const overflow = [];
    data.forEach((d, i) => {
      if (!d) return;
      const type = d.type === 'item' ? 'item' : 'block';
      const id = migrateLegacyId(type === 'item' ? d.itemId : d.blockId);
      if (!id) return;
      const stack = this.createStack(type, id, Math.max(1, d.count || 1));
      if (d.heatedAt != null) stack.heatedAt = d.heatedAt;
      // Stacks bigger than the stack limit (it used to be 64) spill the rest.
      if (stack.count > stack.maxStack) {
        overflow.push({ ...stack, count: stack.count - stack.maxStack });
        stack.count = stack.maxStack;
      }
      if (i < this.TOTAL_SLOTS) this.slots[i] = stack;
      else overflow.push(stack);
    });
    // Stacks that no longer fit (the inventory used to be bigger) are returned so they can be dropped.
    const leftover = [];
    for (const stack of overflow) {
      const left = this.add(stack.type, stack.blockId || stack.itemId, stack.count, stack.heatedAt ?? null);
      if (left > 0) leftover.push({ ...stack, count: left });
    }
    return leftover;
  }
}
