const ingredientGroups = {
  wood: ['oak_log', 'birch_log', 'spruce_log', 'maple_log', 'pine_log'],
  planks: ['oak_planks', 'birch_planks', 'spruce_planks', 'maple_planks', 'pine_planks'],
  leaves: ['oak_leaves', 'birch_leaves', 'spruce_leaves', 'pine_leaves', 'maple_green_leaves', 'maple_orange_leaves', 'maple_red_leaves'],
  stairs: ['oak_stairs', 'birch_stairs', 'spruce_stairs', 'maple_stairs', 'pine_stairs']
};

function ingredientsMatch(itemId, required) {
  if (itemId === required) return true;
  const group = ingredientGroups[required];
  return !!group && group.includes(itemId);
}

function slotId(slot) {
  if (!slot) return null;
  if (slot.type === 'block') return slot.blockId;
  if (slot.type === 'item') return slot.itemId;
  return null;
}

function consumeShapelessInputs(grid, needs) {
  const consumed = {};
  const remainingNeeds = { ...needs };

  for (let i = 0; i < grid.length; i++) {
    const itemId = slotId(grid[i]);
    if (!itemId) continue;
    const neededId = Object.keys(remainingNeeds).find(id => remainingNeeds[id] > 0 && ingredientsMatch(itemId, id));
    if (!neededId) return null;
    consumed[i] = { ...grid[i], count: 1 };
    remainingNeeds[neededId] -= 1;
  }

  for (const id in remainingNeeds) {
    if (remainingNeeds[id] > 0) return null;
  }
  return consumed;
}

function consumeShapedInputs(grid, gridWidth, shape, ingredients) {
  const shapeHeight = shape.length;
  const shapeWidth = shape[0].length;
  if (shapeHeight > gridWidth || shapeWidth > gridWidth) return null;

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
            const itemId = slotId(gridItem);
            if (!itemId || !ingredientsMatch(itemId, ingredients[shapeKey])) {
              match = false;
              break;
            }
            tempConsumed[gridIndex] = { ...gridItem, count: 1 };
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
  { type: 'shaped', shape: ['ss', 'ss'], ingredients: { s: 'sand' }, out: { blockId: 'sandstone', count: 1 } },
  { type: 'shaped', shape: ['ss', 'ss'], ingredients: { s: 'sandstone' }, out: { blockId: 'cut_sandstone', count: 4 } },
  { type: 'shaped', shape: ['s', 's'], ingredients: { s: 'cut_sandstone' }, out: { blockId: 'chiseled_sandstone', count: 1 } },
  { type: 'shaped', shape: ['ss', 'ss'], ingredients: { s: 'red_sand' }, out: { blockId: 'red_sandstone', count: 1 } },
  { type: 'shaped', shape: ['ss', 'ss'], ingredients: { s: 'red_sandstone' }, out: { blockId: 'red_cut_sandstone', count: 4 } },
  { type: 'shaped', shape: ['s', 's'], ingredients: { s: 'red_cut_sandstone' }, out: { blockId: 'red_chiseled_sandstone', count: 1 } },
  { type: 'shaped', shape: ['ss'], ingredients: { s: 'sandstone' }, out: { blockId: 'smooth_sandstone', count: 2 } },
  { type: 'shaped', shape: ['ss'], ingredients: { s: 'red_sandstone' }, out: { blockId: 'red_smooth_sandstone', count: 2 } },
  { type: 'shapeless', in: { rippled_sand: 1 }, out: { blockId: 'sand', count: 1 } },
  { type: 'shapeless', in: { cracked_sand: 1 }, out: { blockId: 'sand', count: 1 } },
  { type: 'shapeless', in: { red_rippled_sand: 1 }, out: { blockId: 'red_sand', count: 1 } },
  { type: 'shapeless', in: { oak_log: 1 }, out: { blockId: 'oak_planks', count: 4 } },
  { type: 'shapeless', in: { birch_log: 1 }, out: { blockId: 'birch_planks', count: 4 } },
  { type: 'shapeless', in: { spruce_log: 1 }, out: { blockId: 'spruce_planks', count: 4 } },
  { type: 'shapeless', in: { pine_log: 1 }, out: { blockId: 'pine_planks', count: 4 } },
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
    shape: ['s s', 'sss', 's s'], 
    ingredients: { s: 'stick' }, 
    out: { blockId: 'ladder', count: 3 } 
  },
  
  {
    type: 'shaped',
    shape: ['ppp', 'p p', 'ppp'],
    ingredients: { p: 'oak_planks' },
    out: { blockId: 'oak_chest', count: 1 }
  },
  {
    type: 'shaped',
    shape: ['ppp', 'p p', 'ppp'],
    ingredients: { p: 'birch_planks' },
    out: { blockId: 'birch_chest', count: 1 }
  },
  {
    type: 'shaped',
    shape: ['ppp', 'p p', 'ppp'],
    ingredients: { p: 'spruce_planks' },
    out: { blockId: 'spruce_chest', count: 1 }
  },
  {
    type: 'shaped',
    shape: ['ppp', 'p p', 'ppp'],
    ingredients: { p: 'maple_planks' },
    out: { blockId: 'maple_chest', count: 1 }
  },
  {
    type: 'shaped',
    shape: ['ppp', 'p p', 'ppp'],
    ingredients: { p: 'pine_planks' },
    out: { blockId: 'pine_chest', count: 1 }
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
    shape: ['iii', ' s ', ' s '],
    ingredients: { i: 'copper_ingot', s: 'stick' },
    out: { itemId: 'copper_pickaxe', count: 1 }
  },
  {
    type: 'shaped',
    shape: ['ii ', 'is ', ' s '],
    ingredients: { i: 'copper_ingot', s: 'stick' },
    out: { itemId: 'copper_axe', count: 1 }
  },
  {
    type: 'shaped',
    shape: [' i ', ' s ', ' s '],
    ingredients: { i: 'copper_ingot', s: 'stick' },
    out: { itemId: 'copper_shovel', count: 1 }
  },
  {
    type: 'shaped',
    shape: [' i ', ' i ', ' s '],
    ingredients: { i: 'copper_ingot', s: 'stick' },
    out: { itemId: 'copper_sword', count: 1 }
  },
  {
    type: 'shaped',
    shape: ['iii', ' s ', ' s '],
    ingredients: { i: 'steel_ingot', s: 'stick' },
    out: { itemId: 'steel_pickaxe', count: 1 }
  },
  {
    type: 'shaped',
    shape: ['ii ', 'is ', ' s '],
    ingredients: { i: 'steel_ingot', s: 'stick' },
    out: { itemId: 'steel_axe', count: 1 }
  },
  {
    type: 'shaped',
    shape: [' i ', ' s ', ' s '],
    ingredients: { i: 'steel_ingot', s: 'stick' },
    out: { itemId: 'steel_shovel', count: 1 }
  },
  {
    type: 'shaped',
    shape: [' i ', ' i ', ' s '],
    ingredients: { i: 'steel_ingot', s: 'stick' },
    out: { itemId: 'steel_sword', count: 1 }
  },
  {
    type: 'shaped',
    shape: ['iii', ' s ', ' s '],
    ingredients: { i: 'gold_ingot', s: 'stick' },
    out: { itemId: 'gold_pickaxe', count: 1 }
  },
  {
    type: 'shaped',
    shape: ['ii ', 'is ', ' s '],
    ingredients: { i: 'gold_ingot', s: 'stick' },
    out: { itemId: 'gold_axe', count: 1 }
  },
  {
    type: 'shaped',
    shape: [' i ', ' s ', ' s '],
    ingredients: { i: 'gold_ingot', s: 'stick' },
    out: { itemId: 'gold_shovel', count: 1 }
  },
  {
    type: 'shaped',
    shape: [' i ', ' i ', ' s '],
    ingredients: { i: 'gold_ingot', s: 'stick' },
    out: { itemId: 'gold_sword', count: 1 }
  },

  { type: 'shapeless', in: { raw_copper: 1 }, out: { itemId: 'copper_ingot', count: 1 } },
  { type: 'shapeless', in: { raw_gold: 1 }, out: { itemId: 'gold_ingot', count: 1 } },
  { type: 'shapeless', in: { raw_steel: 1, coal: 1 }, out: { itemId: 'steel_ingot', count: 1 } },
  { type: 'shapeless', in: { steel_block: 1 }, out: { itemId: 'steel_ingot', count: 9 } },
  { type: 'shapeless', in: { gold_block: 1 }, out: { itemId: 'gold_ingot', count: 9 } },
  { type: 'shapeless', in: { copper: 1 }, out: { itemId: 'copper_ingot', count: 9 } },

  {
    type: 'shaped',
    shape: ['i', 'i'],
    ingredients: { i: 'steel_ingot' },
    out: { itemId: 'steel_rod', count: 4 }
  },

  {
    type: 'shaped',
    shape: ['i', 'i'],
    ingredients: { i: 'gold_ingot' },
    out: { itemId: 'gold_rod', count: 4 }
  },

  {
    type: 'shaped',
    shape: ['i', 'i'],
    ingredients: { i: 'copper_ingot' },
    out: { itemId: 'copper_rod', count: 4 }
  },

  {
    type: 'shaped',
    shape: ['iii', 'iii', 'iii'],
    ingredients: { i: 'steel_ingot' },
    out: { blockId: 'steel_block', count: 1 }
  },

  {
    type: 'shaped',
    shape: ['iii', 'iii', 'iii'],
    ingredients: { i: 'copper_ingot' },
    out: { blockId: 'copper', count: 1 }
  },

  {
    type: 'shaped',
    shape: ['iii', 'iii', 'iii'],
    ingredients: { i: 'gold_ingot' },
    out: { blockId: 'gold_block', count: 1 }
  },
];

export function findMatchingRecipe(grid, is3x3 = false) {
  if (!grid.some(slot => slotId(slot))) return null;
  for (const recipe of recipes) {
    if (consumeRecipeIngredients(grid, recipe, is3x3)) return recipe;
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
