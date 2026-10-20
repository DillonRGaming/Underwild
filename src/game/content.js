// Every block and item, registered once at start-up.
import { BlockRegistry } from '../core/registry.js';
import { registerAllBlocks } from '../../assets/blocks/index.js';
import { registerAllItems } from '../../assets/items/index.js';
import { useCraftingRegistry } from '../logic/crafting.js';
import { useFurnaceRegistry } from '../../assets/blocks/furnace.js';

export const registry = new BlockRegistry();

export const isChest = (id) => registry.get(id)?.kind === 'chest';

registerAllBlocks(registry);

registerAllItems(registry);

useCraftingRegistry(registry);

useFurnaceRegistry(registry);

// Plants and ground clutter: replaced by whatever goes into their cell.
export const isPlantBlock = (id) => !!registry.get(id)?.plant;
