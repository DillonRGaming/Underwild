// Glass: see-through, lets light through, and joins up with the glass next to it into one
// seamless pane (only the outside edges of a run of glass get a frame).
export default {
  id: 'glass',
  displayName: 'Glass',
  material: 'glass',
  kind: 'block',
  tab: 'building',
  tool: 'pickaxe',
  shape: 'full',
  solid: true,
  seeThrough: true,
  connected: true,
  opacity: 0,
  outline: false,
  hardness: 1
};
