export default {
    id: 'glass',
    displayName: 'Glass',
    material: 'glass',
    kind: 'block',
    tab: 'building',
  outline: false, // no dark edge drawn round it
    recipes: [ // how it's crafted
      { shapeless: { sand: 1, coal: 1 }, count: 1 }
    ],
  tool: 'pickaxe', // mined fastest with this
    shape: 'full',
    solid: true,
    color: '#ffffff55',
    hardness: 1,
    opacity: 0
  };
