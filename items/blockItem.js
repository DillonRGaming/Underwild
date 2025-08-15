export function BlockItem(blockId, displayName = null, count = 0, maxStack = 64) {
    return {
      type: 'block',
      blockId,
      displayName: displayName || blockId,
      count,
      maxStack,
    };
  }

export function Item(itemId, displayName = null, count = 0, maxStack = 64) {
    return {
      type: 'item',
      itemId,
      displayName: displayName || itemId,
      count,
      maxStack,
    };
  }
