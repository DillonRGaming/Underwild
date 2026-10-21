// Registers every item: each file in this folder with a default export (see assets/content.js,
// made by build/scripts/gen-content.mjs). A new item is just a new file here.
import { items } from '../content.js';

export function registerAllItems(registry) {
  for (const item of items) registry.register({ ...item, isItem: true });
}
