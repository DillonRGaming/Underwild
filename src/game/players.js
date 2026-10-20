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

// The skin to show and send to other players: a built-in name, or 'custom' with the
// imported PNG as a data URL.
export function playerSkin() {
  const skin = prefs.get('playerSelectedSkin') || 'steve';
  return skin === 'custom' ? { skin, skinData: prefs.get('playerCustomSkin') || null } : { skin, skinData: null };
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

// Draws a skin's side view (head, body, arm, leg, as the game shows players) to a canvas.
export function drawSkinPreview(canvas, img) {
  if (!canvas || !img) return;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = Math.min(canvas.width / 8, canvas.height / 32);
  const cx = canvas.width / 2;
  ctx.drawImage(img, 0, 8, 8, 8, cx - 4 * s, 0, 8 * s, 8 * s); // head
  ctx.drawImage(img, 4, 20, 4, 12, cx - 2 * s, 20 * s, 4 * s, 12 * s); // leg
  ctx.drawImage(img, 32, 20, 4, 12, cx - 2 * s, 8 * s, 4 * s, 12 * s); // body
  ctx.drawImage(img, 44, 20, 4, 12, cx - 2 * s, 8 * s, 4 * s, 12 * s); // arm
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
