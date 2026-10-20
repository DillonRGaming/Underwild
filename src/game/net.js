// LAN multiplayer, wired to the game (see src/multiplayer.js for what each hook is for).
import { gameClock } from '../core/gameClock.js';
import { TILE_SIZE } from '../core/utils.js';
import { PrimedExplosive } from '../entities/primed_explosive.js';
import { ItemEntity } from '../entities/item.js';
import { Multiplayer } from '../multiplayer.js';
import { game, primedExplosives, saveManager, prefs } from './state.js';
import { playerColor, playerName, playerSkin, localPlayerState } from './players.js';
import { addChatLine, showToast } from '../ui/chatLog.js';
import { registry, isChest } from './content.js';
import { findSurfaceY, applyPlayerAction, getSessionMeta } from './session.js';
import { commandsAllowed } from './commands.js';
import { spawnItemEntity, remoteExplosion } from './entities.js';
import { closeInventory } from '../ui/inventoryUI.js';

// --- Multiplayer -----------------------------------------------------------------------
// What src/multiplayer.js needs from the game.
export const multiplayer = new Multiplayer({
  get world() {
    return game.world;
  },
  get player() {
    return game.player;
  },
  get items() {
    return game.items;
  },
  get registry() {
    return registry;
  },
  playerName: () => playerName(),
  playerSkin: () => playerSkin(),
  worldName: () => game.currentWorldSaveName || 'World',
  sessionMeta: () => getSessionMeta(),
  spawnPoint: () => ({ x: game.spawnTileX * TILE_SIZE, y: findSurfaceY(game.spawnTileX) * TILE_SIZE - 33 }),
  clock: () => gameClock.ms,
  setTime: (time, clock) => {
    if (!game.world) return;
    game.world.time = time;
    gameClock.ms = clock;
  },
  localState: () => localPlayerState(),
  guestSaveData: () =>
    game.player
      ? {
          inv: game.inventory.serialize(),
          x: game.player.x,
          y: game.player.y,
          health: game.player.health,
          hunger: game.player.hunger,
          selectedIndex: game.selectedIndex
        }
      : null,
  spawnItemLocal: (id, x, y, count, vx, vy) => spawnItemEntity(id, x, y, count, vx, vy, true),
  makeItemEntity: (id, x, y) => {
    if (!registry.get(id)) return null;
    const e = new ItemEntity(id, x, y, game.world?.time ?? 0);
    e.pickupDelay = Infinity;
    return e;
  },
  receiveItem: (id, count) => {
    const leftover = registry.isItem(id) ? game.inventory.addItem(id, count) : game.inventory.addBlock(id, count);
    if (leftover > 0 && game.player) spawnItemEntity(id, game.player.x + game.player.width / 2, game.player.y, leftover);
  },
  onRemoteCell: (x, y, id) => {
    saveManager.markDirty();
    if (game.openContainer && game.openContainer.tileY === y && (game.openContainer.tileX === x || game.openContainer.ownerX === x)) {
      const blockId = game.world.getBlockId(game.openContainer.tileX, game.openContainer.tileY);
      if (!isChest(blockId) && blockId !== 'crafting_table' && blockId !== 'furnace' && blockId !== 'forging_table') closeInventory();
    }
  },
  containerSignature: () => {
    if (!game.openContainer || !game.world || game.openContainer.title === 'Crafting Table') return null;
    const cell = game.world.getCell(game.openContainer.ownerX ?? game.openContainer.tileX, game.openContainer.tileY);
    return cell.meta ? JSON.stringify(cell.meta.inv ?? null) : null;
  },
  touchOpenContainer: () => {
    if (game.openContainer) game.world.touchCell(game.openContainer.ownerX ?? game.openContainer.tileX, game.openContainer.tileY);
  },
  startGuestWorld: (decoded, saved, spawn, serverName) => game.menuManager.startGuestWorld(decoded, saved, spawn, serverName),
  leaveToMenu: (message) => {
    game.menuManager.showMainMenu();
    if (message) game.menuManager.showNotice(message);
  },
  toast: (text) => showToast(text),
  chat: (name, text, me, color) => (me ? addChatLine(`* ${name} ${text}`, null, '', color) : addChatLine(text, name, '', color)),
  playerColor: () => playerColor(),
  applyAction: (a) => applyPlayerAction(a),
  setTimeFromGuest: (time, manual) => {
    if (!game.world) return;
    game.world.time = time;
    game.world.timeManuallySet = manual;
  },
  commandsAllowed: () => commandsAllowed(),
  // Names (and addresses) the host has banned, kept with the host's settings so they apply
  // to every world it hosts.
  bans: () => (prefs.getJSON('mpBans', []) || []).filter((b) => b && typeof b.name === 'string'),
  setBans: (list) => prefs.set('mpBans', JSON.stringify(list)),
  explosion: (x, y) => remoteExplosion(x, y),
  primed: (x, y, fuse, vx, vy, blockId) =>
    primedExplosives.push(
      Object.assign(new PrimedExplosive(x, y, TILE_SIZE, fuse), { vx: vx || 0, vy: vy || 0, blockId: blockId || 'explosive', remote: true })
    )
});
