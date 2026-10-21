// Registers every block: each file in this folder with a default export (see assets/content.js,
// made by build/scripts/gen-content.mjs). A new block is just a new file here.
import { blocks } from '../content.js';
import { useGrassRegistry } from './grassSpread.js';

export function registerAllBlocks(registry) {
  for (const block of blocks) registry.register(block);
  useGrassRegistry(registry);
}
