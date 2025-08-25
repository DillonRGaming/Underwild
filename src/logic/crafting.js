const ingredientGroups = {
  wood: ['oak_log', 'birch_log', 'spruce_log', 'maple_log'],
  planks: ['oak_planks', 'birch_planks', 'spruce_planks', 'maple_planks'],
  leaves: ['oak_leaves', 'birch_leaves', 'spruce_leaves', 'maple_green_leaves', 'maple_orange_leaves', 'maple_red_leaves'],
  stairs: ['oak_stairs', 'birch_stairs', 'spruce_stairs', 'maple_stairs']
};

function ingredientsMatch(ingredient1, ingredient2) {
  if (ingredient1 === ingredient2) return true;
  
  for (const group in ingredientGroups) {
    const groupItems = ingredientGroups[group];
    if (groupItems.includes(ingredient1) && groupItems.includes(ingredient2)) {
      return true;
    }
  }
  
  return false;
}

function canSatisfy(inputs, needs) {
  const available = { ...inputs };
  
  for (const neededId in needs) {
    const neededCount = needs[neededId];
    let foundCount = 0;
    
    for (const availableId in available) {
      const availableCount = available[availableId];
      
      if (ingredientsMatch(availableId, neededId)) {
        const take = Math.min(availableCount, neededCount - foundCount);
        foundCount += take;
        available[availableId] -= take;
        
        if (available[availableId] <= 0) {
          delete available[availableId];
        }
        
        if (foundCount >= neededCount) {
          break;
        }
      }
    }
    
    if (foundCount < neededCount) {
      return false;
    }
  }
  
  return true;
}

function consumeShapelessInputs(grid, needs) {
  const consumed = {};
  
  const remainingNeeds = { ...needs };
  
  for (let i = 0; i < grid.length; i++) {
    const slot = grid[i];
    if (!slot || (slot.type !== 'block' && slot.type !== 'item')) continue;
    
    const itemId = slot.type === 'block' ? slot.blockId : slot.itemId;
    const slotIndex = i;
    
    for (const neededId in remainingNeeds) {
      const neededCount = remainingNeeds[neededId];
      
      if (neededCount > 0 && ingredientsMatch(itemId, neededId)) {
        if (!consumed[slotIndex]) {
          consumed[slotIndex] = { ...slot, count: 0 };
        }
        
        consumed[slotIndex].count += 1;
        remainingNeeds[neededId] -= 1;
        
        break;
      }
    }
  }
  
  for (const id in remainingNeeds) {
    if (remainingNeeds[id] > 0) {
      return null;
    }
  }
  
  return consumed;
}

function consumeShapedInputs(grid, gridWidth, shape, ingredients) {
  const shapeHeight = shape.length;
  const shapeWidth = shape[0].length;
  const consumed = {};
  
  for (let y = 0; y <= gridWidth - shapeHeight; y++) {
    for (let x = 0; x <= gridWidth - shapeWidth; x++) {
      let match = true;
      const tempConsumed = {};
      
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
            const requiredIngredient = ingredients[shapeKey];
            if (!gridItem || 
                (gridItem.type !== 'block' && gridItem.type !== 'item') ||
                !ingredientsMatch(gridItem.type === 'block' ? gridItem.blockId : gridItem.itemId, requiredIngredient)) {
              match = false;
              break;
            }
            
            if (!tempConsumed[gridIndex]) {
              tempConsumed[gridIndex] = { ...gridItem, count: 0 };
            }
            tempConsumed[gridIndex].count += 1;
          }
        }
        if (!match) break;
      }
      
      if (match) {
        for (let i = 0; i < grid.length; i++) {
          if (grid[i] && !tempConsumed[i]) {
            match = false;
            break;
          }
        }
      }
      
      if (match) {
        return tempConsumed;
      }
    }
  }
  
  return null;
}

const recipes = [
  { type: 'shapeless', in: { oak_log: 1 }, out: { blockId: 'oak_planks', count: 4 } },
  { type: 'shapeless', in: { birch_log: 1 }, out: { blockId: 'birch_planks', count: 4 } },
  { type: 'shapeless', in: { spruce_log: 1 }, out: { blockId: 'spruce_planks', count: 4 } },
  { type: 'shapeless', in: { maple_log: 1 }, out: { blockId: 'maple_planks', count: 4 } },
  
  { 
    type: 'shaped', 
    shape: ['pp', 'pp'], 
    ingredients: { p: 'planks' }, 
    out: { blockId: 'crafting_table', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: ['p', 'p'], 
    ingredients: { p: 'planks' }, 
    out: { itemId: 'stick', count: 4 } 
  },
  
  { 
    type: 'shaped', 
    shape: ['ppp', 'p p', 'ppp'], 
    ingredients: { p: 'planks' }, 
    out: { blockId: 'chest', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: ['p  ', 'pp ', 'ppp'], 
    ingredients: { p: 'planks' }, 
    out: { blockId: 'oak_stairs', count: 4 } 
  },
  
  { 
    type: 'shaped', 
    shape: ['pp', 'pp'], 
    ingredients: { p: 'stone' }, 
    out: { blockId: 'stone_slab', count: 6 } 
  },
  
  { 
    type: 'shaped', 
    shape: ['p  ', 'pp ', 'ppp'], 
    ingredients: { p: 'stone' }, 
    out: { blockId: 'stone_stairs', count: 4 } 
  },
  
  { 
    type: 'shaped', 
    shape: ['ppp', 'ppp', 'ppp'], 
    ingredients: { p: 'stone' }, 
    out: { blockId: 'stone', count: 9 } 
  },
  
  { 
    type: 'shaped', 
    shape: ['ppp', ' s ', ' s '], 
    ingredients: { p: 'planks', s: 'stick' }, 
    out: { itemId: 'wooden_pickaxe', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: ['pp ', 'ps ', ' s '], 
    ingredients: { p: 'planks', s: 'stick' }, 
    out: { itemId: 'wooden_axe', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: [' p ', ' s ', ' s '], 
    ingredients: { p: 'planks', s: 'stick' }, 
    out: { itemId: 'wooden_shovel', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: [' p ', ' p ', ' s '], 
    ingredients: { p: 'planks', s: 'stick' }, 
    out: { itemId: 'wooden_sword', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: [' p ', ' s ', ' s '], 
    ingredients: { p: 'planks', s: 'stick' }, 
    out: { itemId: 'trowel', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: ['ccc', ' s ', ' s '], 
    ingredients: { c: 'stone', s: 'stick' }, 
    out: { itemId: 'copper_pickaxe', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: ['cc ', 'cs ', ' s '], 
    ingredients: { c: 'stone', s: 'stick' }, 
    out: { itemId: 'copper_axe', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: [' c ', ' s ', ' s '], 
    ingredients: { c: 'stone', s: 'stick' }, 
    out: { itemId: 'copper_shovel', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: [' c ', ' c ', ' s '], 
    ingredients: { c: 'stone', s: 'stick' }, 
    out: { itemId: 'copper_sword', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: ['iii', ' s ', ' s '], 
    ingredients: { i: 'stone', s: 'stick' }, 
    out: { itemId: 'iron_pickaxe', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: ['ii ', 'is ', ' s '], 
    ingredients: { i: 'stone', s: 'stick' }, 
    out: { itemId: 'iron_axe', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: [' i ', ' s ', ' s '], 
    ingredients: { i: 'stone', s: 'stick' }, 
    out: { itemId: 'iron_shovel', count: 1 } 
  },
  
  { 
    type: 'shaped', 
    shape: [' i ', ' i ', ' s '], 
    ingredients: { i: 'stone', s: 'stick' }, 
    out: { itemId: 'iron_sword', count: 1 } 
  },
];

export function findMatchingRecipe(grid, is3x3 = false) {
  const gridWidth = is3x3 ? 3 : 2;
  
  const inputs = {};
  let hasAnyItems = false;
  for (const slot of grid) {
    if (!slot) continue;
    if (slot.type === 'block') {
      inputs[slot.blockId] = (inputs[slot.blockId] || 0) + 1;
      hasAnyItems = true;
    } else if (slot.type === 'item') {
      inputs[slot.itemId] = (inputs[slot.itemId] || 0) + 1;
      hasAnyItems = true;
    }
  }
  
  if (!hasAnyItems) return null;
  
  for (const recipe of recipes) {
    if (recipe.type === 'shapeless' && canSatisfy(inputs, recipe.in)) {
      return recipe;
    }
  }
  
  for (const recipe of recipes) {
    if (recipe.type !== 'shaped') continue;
    
    const shape = recipe.shape;
    const shapeHeight = shape.length;
    const shapeWidth = shape[0].length;
    
    if (shapeHeight > gridWidth || shapeWidth > gridWidth) continue;
    
    for (let y = 0; y <= gridWidth - shapeHeight; y++) {
      for (let x = 0; x <= gridWidth - shapeWidth; x++) {
        let match = true;
        
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
              const ingredient = recipe.ingredients[shapeKey];
              if (!gridItem || 
                  (gridItem.type !== 'block' && gridItem.type !== 'item') ||
                  !ingredientsMatch(gridItem.type === 'block' ? gridItem.blockId : gridItem.itemId, ingredient)) {
                match = false;
                break;
              }
            }
          }
          if (!match) break;
        }
        
        if (match) {
          for (let i = 0; i < grid.length; i++) {
            const isPartOfRecipe = (i >= y * gridWidth + x) && 
                                  (i < (y + shapeHeight) * gridWidth + x + shapeWidth) &&
                                  shape[Math.floor((i / gridWidth) - y)][(i % gridWidth) - x] !== undefined;
            
            if (grid[i] && !isPartOfRecipe) {
              match = false;
              break;
            }
          }
        }
        
        if (match) {
          return recipe;
        }
      }
    }
  }
  
  return null;
}

export function consumeRecipeIngredients(grid, recipe, is3x3 = false) {
  const gridWidth = is3x3 ? 3 : 2;
  
  if (recipe.type === 'shapeless') {
    return consumeShapelessInputs(grid, recipe.in);
  } else if (recipe.type === 'shaped') {
    return consumeShapedInputs(grid, gridWidth, recipe.shape, recipe.ingredients);
  }
  
  return null;
}

export function createRecipeOutput(recipe, registry) {
  if (recipe.out.blockId) {
    const blockType = registry.get(recipe.out.blockId);
    const displayName = blockType?.displayName || recipe.out.blockId;
    return { 
      type: 'block', 
      blockId: recipe.out.blockId, 
      displayName, 
      count: recipe.out.count, 
      maxStack: blockType?.maxStack || 64 
    };
  } else if (recipe.out.itemId) {
    const itemType = registry.get(recipe.out.itemId);
    const displayName = itemType?.displayName || recipe.out.itemId;
    return { 
      type: 'item', 
      itemId: recipe.out.itemId, 
      displayName, 
      count: recipe.out.count, 
      maxStack: itemType?.maxStack || 64 
    };
  }
  return null;
}

export function getAllRecipes() {
  return [...recipes];
}

export function addRecipe(recipe) {
  recipes.push(recipe);
}

export function removeRecipe(index) {
  if (index >= 0 && index < recipes.length) {
    recipes.splice(index, 1);
    return true;
  }
  return false;
}
