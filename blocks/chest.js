export default {
  id: 'chest',
  displayName: 'Chest',
  shape: 'full',
  solid: true,
  color: '#b07d4e',
  hardness: 1,
  onPlace: function(world, x, y, meta) {
    const cell = world.getCell(x, y);
    if (!cell.meta) cell.meta = {};
    
    if (!cell.meta.inv) {
      cell.meta.inv = new Array(27).fill(null);
    }
    
    this.checkAndCombineWithAdjacent(world, x, y);
  },
  checkAndCombineWithAdjacent: function(world, x, y) {
    const cell = world.getCell(x, y);
    if (!cell.meta) cell.meta = {};
    
    if (world.inBounds(x + 1, y) && world.getBlockId(x + 1, y) === 'chest') {
      const rightCell = world.getCell(x + 1, y);
      if (!rightCell.meta || (!rightCell.meta.chestType || rightCell.meta.chestType === 'single')) {
        cell.meta.chestType = 'left';
        if (!rightCell.meta) rightCell.meta = {};
        rightCell.meta.chestType = 'right';
        
        if (cell.meta.inv && rightCell.meta.inv) {
          const combinedInv = new Array(54).fill(null);
          for (let i = 0; i < 27; i++) {
            combinedInv[i] = cell.meta.inv[i];
          }
          for (let i = 0; i < 27; i++) {
            combinedInv[i + 27] = rightCell.meta.inv[i];
          }
          cell.meta.inv = combinedInv;
          rightCell.meta.inv = null;
        } else if (rightCell.meta.inv) {
          cell.meta.inv = new Array(54).fill(null);
          for (let i = 0; i < 27; i++) {
            cell.meta.inv[i + 27] = rightCell.meta.inv[i];
          }
          rightCell.meta.inv = null;
        } else if (cell.meta.inv && cell.meta.inv.length === 27) {
          const extendedInv = new Array(54).fill(null);
          for (let i = 0; i < 27; i++) {
            extendedInv[i] = cell.meta.inv[i];
          }
          cell.meta.inv = extendedInv;
        } else if (!cell.meta.inv) {
          cell.meta.inv = new Array(54).fill(null);
        }
        return;
      }
    }
    
    if (world.inBounds(x - 1, y) && world.getBlockId(x - 1, y) === 'chest') {
      const leftCell = world.getCell(x - 1, y);
      if (!leftCell.meta || (!leftCell.meta.chestType || leftCell.meta.chestType === 'single')) {
        if (!leftCell.meta) leftCell.meta = {};
        leftCell.meta.chestType = 'left';
        cell.meta.chestType = 'right';
        
        if (leftCell.meta.inv && cell.meta.inv) {
          const combinedInv = new Array(54).fill(null);
          for (let i = 0; i < 27; i++) {
            combinedInv[i] = leftCell.meta.inv[i];
          }
          for (let i = 0; i < 27; i++) {
            combinedInv[i + 27] = cell.meta.inv[i];
          }
          leftCell.meta.inv = combinedInv;
          cell.meta.inv = null;
        } else if (cell.meta.inv) {
          if (!leftCell.meta.inv) {
            leftCell.meta.inv = new Array(54).fill(null);
          }
          for (let i = 0; i < 27; i++) {
            leftCell.meta.inv[i + 27] = cell.meta.inv[i];
          }
          cell.meta.inv = null;
        } else if (leftCell.meta.inv && leftCell.meta.inv.length === 27) {
          const extendedInv = new Array(54).fill(null);
          for (let i = 0; i < 27; i++) {
            extendedInv[i] = leftCell.meta.inv[i];
          }
          leftCell.meta.inv = extendedInv;
        } else if (!leftCell.meta.inv) {
          leftCell.meta.inv = new Array(54).fill(null);
        }
        return;
      }
    }
    
    if (!cell.meta.chestType) {
      cell.meta.chestType = 'single';
    }
    if (!cell.meta.inv) {
      cell.meta.inv = new Array(27).fill(null);
    } else if (cell.meta.inv.length === 54) {
      const singleInv = new Array(27).fill(null);
      for (let i = 0; i < 27; i++) {
        singleInv[i] = cell.meta.inv[i];
      }
      cell.meta.inv = singleInv;
    }
  },
  onBreak: function(world, x, y, meta) {
    // Preserve the inventory data when breaking the chest
    // The inventory data will be handled in the breaking logic in script.js
    if (meta && meta.chestType) {
      if (meta.chestType === 'left') {
        if (world.inBounds(x + 1, y) && world.getBlockId(x + 1, y) === 'chest') {
          const rightCell = world.getCell(x + 1, y);
          if (rightCell.meta && rightCell.meta.chestType === 'right') {
            rightCell.meta.chestType = 'single';
            if (meta.inv && meta.inv.length === 54) {
              rightCell.meta.inv = new Array(27).fill(null);
              for (let i = 0; i < 27; i++) {
                rightCell.meta.inv[i] = meta.inv[i + 27];
              }
            }
          }
        }
      } else if (meta.chestType === 'right') {
        if (world.inBounds(x - 1, y) && world.getBlockId(x - 1, y) === 'chest') {
          const leftCell = world.getCell(x - 1, y);
          if (leftCell.meta && leftCell.meta.chestType === 'left') {
            leftCell.meta.chestType = 'single';
            if (leftCell.meta.inv && leftCell.meta.inv.length === 54) {
              const singleInv = new Array(27).fill(null);
              for (let i = 0; i < 27; i++) {
                singleInv[i] = leftCell.meta.inv[i];
              }
              leftCell.meta.inv = singleInv;
            }
          }
        }
      }
    }
  }
};
