// Recipes can ask for any block of a group instead of one id; the groups come from the
// blocks' own properties, so a new wood type works in every recipe straight away.
let registry = null;
export function useCraftingRegistry(r) { registry = r; gatherRecipes(); }
const isWooden = (def) => !!registry?.get(`${def.material}_planks`);
const ingredientGroups = {
  wood: (def) => def.trunk && !def.drop,       // any log (not the birch base, which drops a log)
  planks: (def) => def.kind === 'planks',
  leaves: (def) => !!def.leaves,
  stairs: (def) => def.kind === 'stairs' && isWooden(def)
};

function ingredientsMatch(itemId, required) {
  if (itemId === required) return true;
  const group = ingredientGroups[required];
  const def = registry?.get(itemId);
  return !!group && !!def && group(def);
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

// Every recipe lives in the file of the block or item it makes, as
//   recipes: [{ shape: ['pp', 'pp'], ingredients: { p: 'oak_planks' }, count: 4 }]
// or, for any arrangement, { shapeless: { stick: 1, coal: 1 }, count: 4 }.
// They're gathered from the registry once everything is registered (useCraftingRegistry).
const recipes = [];

function gatherRecipes() {
  recipes.length = 0;
  for (const [id, def] of registry.entries()) {
    for (const r of def.recipes || []) {
      const out = { [def.isItem ? 'itemId' : 'blockId']: id, count: r.count ?? 1 };
      recipes.push(r.shapeless
        ? { type: 'shapeless', in: r.shapeless, out }
        : { type: 'shaped', shape: r.shape, ingredients: r.ingredients, out });
    }
  }
}

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
      maxStack: blockType?.maxStack || 24 
    };
  } else if (recipe.out.itemId) {
    const itemType = registry.get(recipe.out.itemId);
    const displayName = itemType?.displayName || recipe.out.itemId;
    return { 
      type: 'item', 
      itemId: recipe.out.itemId, 
      displayName, 
      count: recipe.out.count, 
      maxStack: itemType?.maxStack || 24 
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

// What a recipe uses in total, as { ingredient: count } (ingredients can be groups such
// as 'planks'), for crafting straight from the inventory.
export function recipeNeeds(recipe) {
  if (recipe.type === 'shapeless') return { ...recipe.in };
  const needs = {};
  for (const row of recipe.shape) {
    for (const key of row) {
      if (key === ' ') continue;
      const id = recipe.ingredients[key];
      needs[id] = (needs[id] || 0) + 1;
    }
  }
  return needs;
}

// Whether a recipe fits the small 2x2 grid you have without a crafting table.
export function fitsSmallGrid(recipe) {
  if (recipe.type === 'shapeless') return Object.values(recipe.in).reduce((a, b) => a + b, 0) <= 4;
  return recipe.shape.length <= 2 && recipe.shape.every(row => row.length <= 2);
}

export function itemMatchesIngredient(itemId, ingredient) {
  return ingredientsMatch(itemId, ingredient);
}
