// Crafting system for Underwild
// Supports both shapeless and shaped recipes with flexible ingredient matching

// Recipe format:
// {
//   type: 'shapeless' | 'shaped',
//   in: { blockId: count } | null,           // For shapeless recipes
//   shape: ['ppp', 'p p', 'ppp'] | null,     // For shaped recipes
//   ingredients: { p: 'planks' } | null,     // For shaped recipes
//   out: { blockId: 'chest', count: 1 } | { itemId: 'stick', count: 4 }
// }

// Flexible ingredient matching system
const ingredientGroups = {
  // Wood types that can be used interchangeably
  wood: ['oak_log', 'birch_log', 'spruce_log', 'maple_log'],
  planks: ['oak_planks', 'birch_planks', 'spruce_planks', 'maple_planks'],
  leaves: ['oak_leaves', 'birch_leaves', 'spruce_leaves', 'maple_green_leaves', 'maple_orange_leaves', 'maple_red_leaves'],
  stairs: ['oak_stairs', 'birch_stairs', 'spruce_stairs', 'maple_stairs']
};

// Check if two ingredients are equivalent (considering groups)
function ingredientsMatch(ingredient1, ingredient2) {
  // Direct match
  if (ingredient1 === ingredient2) return true;
  
  // Check if they belong to the same group
  for (const group in ingredientGroups) {
    const groupItems = ingredientGroups[group];
    if (groupItems.includes(ingredient1) && groupItems.includes(ingredient2)) {
      return true;
    }
  }
  
  return false;
}

// Check if inputs satisfy needs (considering ingredient groups)
function canSatisfy(inputs, needs) {
  // Create a copy of inputs to track consumption
  const available = { ...inputs };
  
  // For each needed ingredient
  for (const neededId in needs) {
    const neededCount = needs[neededId];
    let foundCount = 0;
    
    // Check available ingredients for matches
    for (const availableId in available) {
      const availableCount = available[availableId];
      
      // If this available ingredient matches what we need
      if (ingredientsMatch(availableId, neededId)) {
        const take = Math.min(availableCount, neededCount - foundCount);
        foundCount += take;
        available[availableId] -= take;
        
        // Remove if depleted
        if (available[availableId] <= 0) {
          delete available[availableId];
        }
        
        // If we've found enough, break
        if (foundCount >= neededCount) {
          break;
        }
      }
    }
    
    // If we couldn't find enough of this ingredient
    if (foundCount < neededCount) {
      return false;
    }
  }
  
  return true;
}

// Consume inputs for a shapeless recipe
function consumeShapelessInputs(grid, needs) {
  const consumed = {};
  
  // Create a copy of needs to track consumption
  const remainingNeeds = { ...needs };
  
  // For each slot in the grid
  for (let i = 0; i < grid.length; i++) {
    const slot = grid[i];
    if (!slot || slot.type !== 'block') continue;
    
    const blockId = slot.blockId;
    const slotIndex = i;
    
    // Check if this ingredient is needed
    for (const neededId in remainingNeeds) {
      const neededCount = remainingNeeds[neededId];
      
      if (neededCount > 0 && ingredientsMatch(blockId, neededId)) {
        // Consume one from this slot
        if (!consumed[slotIndex]) {
          consumed[slotIndex] = { ...slot, count: 0 };
        }
        
        consumed[slotIndex].count += 1;
        remainingNeeds[neededId] -= 1;
        
        // Break inner loop since we've consumed from this slot
        break;
      }
    }
  }
  
  // Check if all needs were satisfied
  for (const id in remainingNeeds) {
    if (remainingNeeds[id] > 0) {
      return null; // Failed to consume all needed ingredients
    }
  }
  
  return consumed;
}

// Consume inputs for a shaped recipe
function consumeShapedInputs(grid, gridWidth, shape, ingredients) {
  const shapeHeight = shape.length;
  const shapeWidth = shape[0].length;
  const consumed = {};
  
  // Try to match the shape at each possible position
  for (let y = 0; y <= gridWidth - shapeHeight; y++) {
    for (let x = 0; x <= gridWidth - shapeWidth; x++) {
      let match = true;
      const tempConsumed = {};
      
      // Check if shape matches at this position
      for (let sy = 0; sy < shapeHeight; sy++) {
        for (let sx = 0; sx < shapeWidth; sx++) {
          const shapeKey = shape[sy][sx];
          const gridIndex = (y + sy) * gridWidth + (x + sx);
          const gridItem = grid[gridIndex];
          
          if (shapeKey === ' ') {
            // This should be empty
            if (gridItem) {
              match = false;
              break;
            }
          } else {
            // This should be the specified ingredient
            const requiredIngredient = ingredients[shapeKey];
            if (!gridItem || gridItem.type !== 'block' || 
                !ingredientsMatch(gridItem.blockId, requiredIngredient)) {
              match = false;
              break;
            }
            
            // Mark this item for consumption
            if (!tempConsumed[gridIndex]) {
              tempConsumed[gridIndex] = { ...gridItem, count: 0 };
            }
            tempConsumed[gridIndex].count += 1;
          }
        }
        if (!match) break;
      }
      
      if (match) {
        // Additional check: ensure no other items are in the grid
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
  
  return null; // No matching position found
}

// Recipe definitions
const recipes = [
  // Shapeless recipes (log -> planks)
  { type: 'shapeless', in: { oak_log: 1 }, out: { blockId: 'oak_planks', count: 4 } },
  { type: 'shapeless', in: { birch_log: 1 }, out: { blockId: 'birch_planks', count: 4 } },
  { type: 'shapeless', in: { spruce_log: 1 }, out: { blockId: 'spruce_planks', count: 4 } },
  { type: 'shapeless', in: { maple_log: 1 }, out: { blockId: 'maple_planks', count: 4 } },
  
  // 2x2 shaped recipes
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
  
  // 3x3 shaped recipes
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
  
  // Add more recipes here as needed
];

// Find a matching recipe for the given grid
export function findMatchingRecipe(grid, is3x3 = false) {
  const gridWidth = is3x3 ? 3 : 2;
  
  // Optimize by precomputing inputs only once
  const inputs = {};
  let hasAnyBlocks = false;
  for (const slot of grid) {
    if (!slot || slot.type !== 'block') continue;
    inputs[slot.blockId] = (inputs[slot.blockId] || 0) + 1;
    hasAnyBlocks = true;
  }
  
  // Early exit if no blocks in grid
  if (!hasAnyBlocks) return null;
  
  // Check shapeless recipes first
  for (const recipe of recipes) {
    if (recipe.type === 'shapeless' && canSatisfy(inputs, recipe.in)) {
      return recipe;
    }
  }
  
  // Check shaped recipes
  for (const recipe of recipes) {
    if (recipe.type !== 'shaped') continue;
    
    const shape = recipe.shape;
    const shapeHeight = shape.length;
    const shapeWidth = shape[0].length;
    
    // Early exit if recipe is too big for grid
    if (shapeHeight > gridWidth || shapeWidth > gridWidth) continue;
    
    // Try to match at each position
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
              if (!gridItem || gridItem.type !== 'block' || 
                  !ingredientsMatch(gridItem.blockId, ingredient)) {
                match = false;
                break;
              }
            }
          }
          if (!match) break;
        }
        
        if (match) {
          // Check that no other items are in the grid
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

// Consume ingredients for a recipe
export function consumeRecipeIngredients(grid, recipe, is3x3 = false) {
  const gridWidth = is3x3 ? 3 : 2;
  
  if (recipe.type === 'shapeless') {
    return consumeShapelessInputs(grid, recipe.in);
  } else if (recipe.type === 'shaped') {
    return consumeShapedInputs(grid, gridWidth, recipe.shape, recipe.ingredients);
  }
  
  return null;
}

// Create output item/block from recipe
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

// Get all recipes (for UI display or debugging)
export function getAllRecipes() {
  return [...recipes];
}

// Add a new recipe (for mods or dynamic recipe addition)
export function addRecipe(recipe) {
  recipes.push(recipe);
}

// Remove a recipe by index
export function removeRecipe(index) {
  if (index >= 0 && index < recipes.length) {
    recipes.splice(index, 1);
    return true;
  }
  return false;
}
