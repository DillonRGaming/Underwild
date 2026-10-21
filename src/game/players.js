// The local player as others see them: name, skin, chat colour and the state sent each tick.
import { game, prefs } from './state.js';
import { multiplayer } from './net.js';

// Your colour for chat and your name tag: the eight named ones, or any #rrggbb. null = default.
export const NAMED_COLORS = {
  red: '#ff5555',
  orange: '#ffaa33',
  yellow: '#ffe74d',
  green: '#5ee05e',
  cyan: '#4dd9e6',
  blue: '#5b8cff',
  purple: '#b366ff',
  pink: '#ff7ad9'
};

export function parseColor(text) {
  const t = String(text || '').toLowerCase();
  if (t in NAMED_COLORS) return NAMED_COLORS[t];
  let hex = t.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(hex))
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
}

export function playerColor() {
  const c = prefs.get('chatColor');
  return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null;
}

export function setPlayerColor(c) {
  prefs.set('chatColor', c);
  multiplayer.sendColor(c);
}

export function playerName() {
  return String(prefs.get('playerUsername') || 'Player').slice(0, 20);
}

// Changes your name (the one the menu's name box sets).
export function setPlayerName(name) {
  const clean = String(name).trim().slice(0, 20) || 'Player';
  prefs.set('playerUsername', clean);
  if (game.player) game.player.username = clean;
  return clean;
}

// Imported skins: [{ id, name, data (PNG data URL) }]. The one skin imported before there
// was a list (playerCustomSkin) becomes its first entry.
export function savedSkins() {
  // Preferences are stored as text: read it back as a list (getJSON).
  let list = prefs.getJSON('playerSkins', null);
  if (!Array.isArray(list)) {
    list = [];
    const old = prefs.get('playerCustomSkin');
    if (old) list.push({ id: 'custom', name: 'Custom', data: old });
    prefs.set('playerSkins', list);
  }
  return list.filter((s) => s && s.id && s.data);
}

export function setSavedSkins(list) {
  prefs.set('playerSkins', list);
}

// The skin to show and send to other players: a built-in name, or 'custom' with the
// imported PNG as a data URL.
export function playerSkin() {
  const skin = prefs.get('playerSelectedSkin') || 'steve';
  if (skin === 'steve') return { skin, skinData: null };
  const saved = savedSkins().find((s) => s.id === skin);
  return saved ? { skin: 'custom', skinData: saved.data } : { skin: 'steve', skinData: null };
}

export function localPlayerState() {
  const held = game.inventory.getSlot(game.selectedIndex);
  const uiOpen = game.inventoryOpen || !!game.openContainer || game.textInputMode;
  return {
    x: Math.round(game.player.x * 100) / 100,
    y: Math.round(game.player.y * 100) / 100,
    vx: Math.round(game.player.vx),
    vy: Math.round(game.player.vy),
    ground: !!game.player.onGround,
    cr: !!game.player.crouching,
    fly: !!game.player.creativeFlying,
    ax: Math.round(game.camera.screenToWorldX(game.input.mouse.x)),
    ay: Math.round(game.camera.screenToWorldY(game.input.mouse.y)),
    mine: !!(game.breaker.state?.active || (game.input.mouse.leftDown && !uiOpen)),
    sw: Math.round((game.player.swingingArm || 0) * 100) / 100,
    act: game.player.armAction?.type || null,
    actKey: game.player.armAction?.start || 0,
    held: held ? { type: held.type, blockId: held.blockId, itemId: held.itemId, count: 1 } : null,
    hu: game.player.hurtAt || 0
  };
}

// Where each part's face is on a 64x64 skin, for each way a player can face ([x, y] of the
// part's face; legacy 64x32 skins mirror the right limbs for the left ones).
const FACES = {
  Front: { head: [8, 8], hat: [40, 8], body: [20, 20], rArm: [44, 20], lArm: [36, 52], rLeg: [4, 20], lLeg: [20, 52] },
  Back: { head: [24, 8], hat: [56, 8], body: [32, 20], rArm: [52, 20], lArm: [44, 52], rLeg: [12, 20], lLeg: [28, 52] },
  Right: { head: [0, 8], hat: [32, 8], arm: [40, 20], leg: [0, 20] },
  Left: { head: [16, 8], hat: [48, 8], arm: [40, 52], leg: [24, 52], legacyArm: [48, 20], legacyLeg: [8, 20] }
};

// Draws a whole skin (32 px tall figure) facing `view`, scaled to fit the canvas; `swing`
// (-1..1) swings the arms and legs, for the walk preview.
export function drawSkinView(canvas, img, view = 'Front', swing = 0) {
  if (!canvas || !img?.width) return;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = Math.floor(Math.min(canvas.width / 16, canvas.height / 34));
  const legacy = img.height === 32;
  const f = FACES[view] || FACES.Front;
  const ox = Math.round(canvas.width / 2),
    oy = Math.round((canvas.height - 32 * s) / 2) + s;
  const part = (sx, sy, w, h, dx, dy, mirror = false, angle = 0, pivotY = 0) => {
    ctx.save();
    ctx.translate(ox + dx * s + (w * s) / 2, oy + (dy + pivotY) * s);
    if (angle) ctx.rotate(angle);
    if (mirror) ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, w, h, (-w * s) / 2, -pivotY * s, w * s, h * s);
    ctx.restore();
  };
  const a = swing * 0.6;
  if (view === 'Front' || view === 'Back') {
    const back = view === 'Back';
    // Seen from behind, the right limbs are on the left of the picture.
    const [ra, la, rl, ll] = back ? [4, -8, 0, -4] : [-8, 4, -4, 0];
    const lArm = legacy ? f.rArm : f.lArm,
      lLeg = legacy ? f.rLeg : f.lLeg;
    part(...f.rLeg, 4, 12, rl, 20, false, a * 0.6, 0);
    part(...lLeg, 4, 12, ll, 20, legacy, -a * 0.6, 0);
    part(...f.body, 8, 12, -4, 8);
    part(...f.rArm, 4, 12, ra, 8, false, -a * 0.4, 1);
    part(...lArm, 4, 12, la, 8, legacy, a * 0.4, 1);
    part(...f.head, 8, 8, -4, 0);
    part(...f.hat, 8, 8, -4, 0);
  } else {
    const arm = legacy && f.legacyArm ? f.legacyArm : f.arm;
    const leg = legacy && f.legacyLeg ? f.legacyLeg : f.leg;
    const dir = view === 'Right' ? 1 : -1;
    // The far leg and arm swing the other way, a little darker.
    ctx.filter = 'brightness(0.7)';
    part(...leg, 4, 12, -2, 20, false, -a * dir, 0);
    part(...arm, 4, 12, -2, 8, false, a * dir, 1);
    ctx.filter = 'none';
    part(...leg, 4, 12, -2, 20, false, a * dir, 0);
    part(...(view === 'Right' ? [16, 20] : [28, 20]), 4, 12, -2, 8);
    part(...arm, 4, 12, -2, 8, false, -a * dir, 1);
    part(...f.head, 8, 8, -4, 0);
    part(...f.hat, 8, 8, -4, 0);
  }
}

// Points the local player at the chosen skin (a built-in texture or an imported PNG).
export function applyLocalSkin() {
  if (!game.player) return;
  const { skin, skinData } = playerSkin();
  game.player.skin = skin;
  game.player.skinImage = null;
  if (skinData) {
    const img = new Image();
    img.onload = () => {
      if (game.player) game.player.skinImage = img;
    };
    img.src = skinData;
  }
}
