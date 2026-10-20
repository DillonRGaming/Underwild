// Graphics polish toggles: a master switch plus one per effect. With the master off the
// game draws exactly as it did before the polish was added.
export const POLISH_OPTIONS = [
  ['outlines', 'Block Outlines'],
  ['rounding', 'Rounded Corners'],
  ['seams', 'Block Edge Shading'],
  ['wallShadows', 'Wall Shadows'],
  ['connectedGrass', 'Connected Grass'],
  ['rockOverlay', 'Rock Overlay'],
  ['leaves', 'Fuller Leaves'],
  ['entityOutlines', 'Player & Item Outlines'],
  ['sky', 'Sky Gradient'],
  ['clouds', 'Pixel Clouds'],
  ['hills', 'Distant Land'],
  ['smoothLight', 'Smooth Lighting'],
  ['vignette', 'Vignette'],
  ['icons', 'Polished Icons'],
  ['uiCorners', 'UI Corners']
];

const state = { enabled: true };
for (const [key] of POLISH_OPTIONS) state[key] = true;

// Is this effect on? (Master switch and the effect's own toggle.)
export function polishOn(key) {
  return state.enabled && state[key] !== false;
}

export function polishState() {
  return state;
}

export function setPolish(key, value) {
  state[key] = !!value;
}

export function loadPolish(saved) {
  if (!saved || typeof saved !== 'object') return;
  for (const key of Object.keys(state)) if (typeof saved[key] === 'boolean') state[key] = saved[key];
}
