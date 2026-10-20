// Chat and /commands: typing, suggestions and what each command does.
//
// Every command lists the exact ways it can be written (its forms), e.g. /tp <place>,
// /tp <x> <y>, /tp <player> <player>. Each argument has a type that says which words it takes
// and what to suggest. While typing, only the forms that still fit what's been typed are shown,
// and only the values the argument being typed can take are suggested; running a command
// needs every word to be a value its place takes, or it says how the command is written.
import { BIOMES, findBiomeId, nearestBiomeEdge, BIOME_ZONE } from '../logic/biomes.js';
import { listDimensions, resolveDimensionId } from '../core/dimensions.js';
import { TILE_SIZE } from '../core/utils.js';
import { nearestFallenTreeX, nearestLakeX } from '../logic/terrainGen.js';
import { ItemEntity } from '../entities/item.js';
import { perf } from '../core/perf.js';
import { registry } from './content.js';
import { multiplayer } from './net.js';
import { playerName, setPlayerName, NAMED_COLORS, parseColor } from './players.js';
import { applyPlayerAction, placePlayerAtSurface, loadInitialChunks, teleportToDimension } from './session.js';
import { addChatLine, collapseChatHistory } from '../ui/chatLog.js';
import { wind } from '../core/wind.js';
import { weather, WEATHER_TYPES } from '../core/weather.js';
import { game, tpVisited } from './state.js';

const chatHistory = [];
const MAX_SUGGESTIONS = 10;

const TIME_NAMES = { dawn: 0.25, day: 0.5, noon: 0.5, sunset: 0.75, night: 0, midnight: 0 };
const ITEM_CONFIG = {
  pickuprange: ['pickupRange', (v) => v],
  attractionrange: ['attractionRange', (v) => v],
  attractionforce: ['attractionForce', (v) => v],
  pickupdelay: ['pickupDelay', (v) => Math.max(0, Math.floor(v))],
  gravity: ['gravity', (v) => v],
  maxlife: ['maxLife', (v) => Math.max(0, Math.floor(v))]
};
const FALLEN_WORDS = ['fallen', 'fallen_tree', 'fallen_log', 'log'];
const WATER_WORDS = ['water', 'lake', 'beach'];

// /giveall groups, picked out by each block's or item's own properties.
const itemCategories = {
  tools: (d) => ['pickaxe', 'axe', 'shovel', 'sword'].includes(d.kind),
  forging: (d) => d.kind === 'tool_head' || /_heated$/.test(d.id) || ['forging_table', 'blacksmith_hammer', 'bucket', 'water_bucket'].includes(d.id),
  woods: (d) => d.trunk && !d.drop,
  planks: (d) => d.kind === 'planks',
  leaves: (d) => !!d.leaves,
  dirt: (d) => ['dirt', 'grass', 'mud', 'sand', 'red_sand', 'gravel'].includes(d.material) && !d.plant,
  sandstone: (d) => d.material === 'sandstone' || d.material === 'red_sandstone'
};

const itemCategoryIds = (name) => {
  const pick = itemCategories[name];
  return pick ? [...registry.entries()].filter(([, d]) => !d.hidden && pick(d)).map(([id]) => id) : null;
};

// --- Players a command can be aimed at --------------------------------------------------
// A player's name, or self (you), nearest (the nearest other player), all, random.
// How long /time takes to get to its new time, in seconds of play.
const TIME_GLIDE_SECONDS = 3;
const SELECTORS = ['self', 'nearest', 'all', 'random'];

// Little pixel icons (16x16, filled) shown beside player suggestions, so a player's name can't
// be mistaken for a plain word.
const GLYPHS = {
  person: '<path d="M5 2 H11 V8 H5 Z M3 10 H13 V14 H3 Z"/>',
  group: '<path d="M2 4 H6 V8 H2 Z M10 4 H14 V8 H10 Z M1 10 H7 V14 H1 Z M9 10 H15 V14 H9 Z"/>',
  random: '<path d="M3 3 H13 V13 H3 Z M5 5 V11 H11 V5 Z M6 6 H8 V8 H6 Z M8 8 H10 V10 H8 Z" fill-rule="evenodd"/>'
};
const SELECTOR_GLYPHS = { all: 'group', random: 'random' };

function commandPlayers() {
  const self = { id: multiplayer.isGuest ? multiplayer.myId : 0, name: playerName(), self: true, x: game.player.x, y: game.player.y };
  const others = [...multiplayer.remotePlayers.values()].map((rp) => ({ id: rp.id, name: rp.name, x: rp.x, y: rp.y }));
  return [self, ...others];
}

function isPlayerRef(sel) {
  if (!sel) return false;
  const s = sel.toLowerCase();
  return SELECTORS.includes(s) || commandPlayers().some((p) => p.name.toLowerCase() === s);
}

function resolvePlayers(sel) {
  const all = commandPlayers();
  const s = (sel || 'self').toLowerCase();
  if (s === 'self') return [all[0]];
  if (s === 'all') return all;
  if (s === 'random') return [all[Math.floor(Math.random() * all.length)]];
  if (s === 'nearest') {
    const others = all.slice(1).sort((a, b) => Math.hypot(a.x - game.player.x, a.y - game.player.y) - Math.hypot(b.x - game.player.x, b.y - game.player.y));
    return [others[0] || all[0]];
  }
  return all.filter((p) => p.name.toLowerCase() === s);
}

// Do something to a player: here if it's us, otherwise sent to their game.
function actOnPlayer(target, action) {
  if (target.self) applyPlayerAction(action);
  else multiplayer.sendAction(target.id, action);
}

// --- Argument types ------------------------------------------------------------------------
// accepts(word, arg): whether the word is a value this argument takes. suggest(arg): the
// values to offer, as { id, displayName, icon }. parse(word, arg): the value handed to the
// command (the word itself if there's no parse).
const words = (list) => list.map((id) => ({ id, displayName: id }));
const isNumberWord = (w) => w !== '' && Number.isFinite(Number(w));
const lower = (w) => w.toLowerCase();

const TYPES = {
  player: {
    invalid: (w) => `No player called "${w}" is here.`,
    accepts: (w) => isPlayerRef(w),
    suggest: () => [
      ...SELECTORS.map((id) => ({ id, displayName: id, glyph: SELECTOR_GLYPHS[id] || 'person' })),
      ...commandPlayers().map((p) => ({ id: p.name, displayName: p.name, glyph: 'person' }))
    ]
  },
  // Someone in your game (the host's moderation commands).
  guest: {
    invalid: (w) => `No one called "${w}" is in your game.`,
    accepts: (w) => !!multiplayer.findGuest(w),
    suggest: () => words(multiplayer.guests().map((p) => p.name))
  },
  // Any name; the people in your game are suggested.
  anyName: {
    invalid: (w) => `"${w}" is too long for a name.`,
    accepts: (w) => w.length > 0 && w.length <= 20,
    suggest: () => words(multiplayer.guests().map((p) => p.name))
  },
  banned: {
    invalid: (w) => `"${w}" isn't banned.`,
    accepts: (w) => multiplayer.game.bans().some((b) => b.name.toLowerCase() === lower(w)),
    suggest: () => words(multiplayer.game.bans().map((b) => b.name))
  },
  item: {
    invalid: (w) => `There's no item called "${w}".`,
    accepts: (w) => registry.has(lower(w)) && !['air', 'water'].includes(lower(w)),
    suggest: () =>
      [...registry.entries()]
        .filter(([id, d]) => id !== 'air' && id !== 'water' && !d.hidden)
        .map(([id, d]) => ({ id, displayName: d.displayName || id, icon: true })),
    parse: lower
  },
  block: {
    invalid: (w) => `There's no block called "${w}".`,
    accepts: (w) => registry.isBlock(lower(w)) && lower(w) !== 'air',
    suggest: () =>
      [...registry.blocks()]
        .filter(([id, d]) => id !== 'air' && id !== 'water' && !d.hidden)
        .map(([id, d]) => ({ id, displayName: d.displayName || id, icon: true })),
    parse: lower
  },
  group: {
    invalid: (w) => `There's no group called "${w}". Groups: ${Object.keys(itemCategories).join(', ')}.`,
    accepts: (w) => lower(w) in itemCategories,
    suggest: () => words(Object.keys(itemCategories)),
    parse: lower
  },
  color: {
    invalid: (w) => `"${w}" isn't a colour. Use ${Object.keys(NAMED_COLORS).join(', ')}, reset, or a hex like #ff8800.`,
    accepts: (w) => ['reset', 'default'].includes(lower(w)) || !!parseColor(w),
    suggest: () => [...Object.entries(NAMED_COLORS).map(([id, swatch]) => ({ id, displayName: id, swatch })), { id: 'reset', displayName: 'reset' }],
    parse: (w) => (['reset', 'default'].includes(lower(w)) ? null : parseColor(w))
  },
  command: {
    invalid: (w) => `There's no command called "/${w.replace(/^\//, '')}".`,
    accepts: (w) => !!findCommand(lower(w).replace(/^\//, '')),
    suggest: () => words(availableCommands.map((c) => c.cmd)),
    parse: (w) => findCommand(lower(w).replace(/^\//, ''))
  },
  // Another world (the Moon, Mars...).
  world: {
    invalid: (w) => `There's no world called "${w}".`,
    accepts: (w) => !!resolveDimensionId(w),
    suggest: () => listDimensions().map((d) => ({ id: d.id, displayName: `${d.displayName} (World)` })),
    parse: (w) => resolveDimensionId(w)
  },
  // Somewhere to go: a world, a biome, the nearest fallen tree or lake.
  place: {
    invalid: (w) => `There's no place called "${w}".`,
    accepts: (w) => !!resolveDimensionId(w) || FALLEN_WORDS.includes(lower(w)) || WATER_WORDS.includes(lower(w)) || !!findBiomeId(w),
    suggest: () => [
      ...listDimensions().map((d) => ({ id: d.id, displayName: `${d.displayName} (World)` })),
      { id: 'fallen', displayName: 'Nearest fallen tree' },
      { id: 'water', displayName: 'Nearest lake' },
      ...Object.entries(BIOMES).map(([id, b]) => ({ id, displayName: b.name }))
    ]
  },
  // A block coordinate: a number, ~ (where you are) or ~5 (5 from where you are).
  coord: {
    invalid: (w) => `"${w}" isn't a coordinate (a number, ~ or ~5).`,
    accepts: (w) => /^~?-?\d*\.?\d*$/.test(w) && w !== '-' && w !== '~-',
    suggest: () => words(['~'])
  },
  // A number, with `min`, `max` and `integer` on the argument; `examples` are suggested.
  number: {
    invalid: (w, a) => numberMessage(w, a),
    accepts: (w, a) => isNumberWord(w) && Number(w) >= (a.min ?? -Infinity) && Number(w) <= (a.max ?? Infinity) && (!a.integer || Number.isInteger(Number(w))),
    suggest: (a) => words(a.examples || []),
    parse: (w) => Number(w)
  },
  // One of a few words (`options`; `aliases` maps other words onto them).
  word: {
    invalid: (w, a) => `"${w}" isn't one of: ${a.options.join(', ')}.`,
    accepts: (w, a) => a.options.includes(lower(w)) || lower(w) in (a.aliases || {}),
    suggest: (a) => words(a.options),
    parse: (w, a) => a.aliases?.[lower(w)] ?? lower(w)
  },
  // A time of day: a name, HH:MM, or 0-1 of the way through the day.
  timeOfDay: {
    invalid: (w) => `"${w}" isn't a time of day: use dawn, day, sunset, night or HH:MM.`,
    accepts: (w) => parseTimeOfDay(w) !== null,
    suggest: () => words(['dawn', 'day', 'sunset', 'night']),
    parse: (w) => parseTimeOfDay(w)
  },
  // An amount of time: hours, or HH:MM.
  duration: {
    invalid: (w) => `"${w}" isn't an amount of time: use hours or HH:MM.`,
    accepts: (w) => parseHours(w) !== null,
    suggest: () => words(['1', '6', '12']),
    parse: (w) => parseHours(w)
  },
  // Anything (one word).
  name: {
    invalid: (w) => `"${w}" isn't a name.`,
    accepts: (w) => w.length > 0,
    suggest: () => []
  },
  // The rest of the line, spaces and all (always the last argument).
  text: {
    invalid: () => '',
    accepts: () => true,
    suggest: () => []
  }
};

function numberMessage(w, a) {
  const kind = a.integer ? 'a whole number' : 'a number';
  if (a.min !== undefined && a.max !== undefined) return `"${w}" isn't ${kind} from ${a.min} to ${a.max}.`;
  if (a.min !== undefined) return `"${w}" isn't ${kind} of at least ${a.min}.`;
  return `"${w}" isn't ${kind}.`;
}

function parseHHMM(w) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(w);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  return minutes > 59 ? null : hours + minutes / 60;
}

function parseTimeOfDay(w) {
  const s = lower(w);
  if (s in TIME_NAMES) return TIME_NAMES[s];
  const hours = parseHHMM(s);
  if (hours !== null) return hours < 24 ? hours / 24 : null;
  return isNumberWord(s) && Number(s) >= 0 && Number(s) <= 1 ? Number(s) : null;
}

function parseHours(w) {
  const hours = parseHHMM(w);
  if (hours !== null) return hours;
  return isNumberWord(w) ? Number(w) : null;
}

// --- The commands ----------------------------------------------------------------------------
// An argument: arg(type, key, label, { optional, options, min, max, ... }). `key` is what the
// command reads it as; `label` is shown in the pill.
const arg = (type, key, label = key, extra = {}) => ({ type, key, label, ...extra });
const opt = (type, key, label = key, extra = {}) => arg(type, key, label, { ...extra, optional: true });
const lit = (word, section) => arg('word', '_' + word, word, { options: [word], ...(section && { section }) });
const ON_OFF = { options: ['on', 'off'], aliases: { true: 'on', false: 'off' } };
const FILL_SHAPE = { options: ['solid', 'hollow'] };
// Each command: its name, a short description, its forms (lists of arguments), and optionally
// `aliases` (other names), `chat` (works even with commands off) or `host` (multiplayer host only).
const availableCommands = [
  {
    cmd: 'give',
    desc: 'Give items to a player',
    forms: [
      [arg('player', 'who', 'who'), arg('item', 'item'), opt('number', 'amount', 'amount', { min: 1, max: 9999, integer: true, examples: ['1', '24'] })]
    ]
  },
  {
    cmd: 'giveall',
    desc: 'Give one of everything in a group',
    forms: [[arg('player', 'who', 'who'), arg('group', 'group')]]
  },
  {
    cmd: 'giverandom',
    desc: 'Give random items',
    forms: [[arg('player', 'who', 'who'), opt('number', 'count', 'count', { min: 1, max: 100, integer: true })]]
  },
  { cmd: 'clear', desc: "Empty a player's inventory", forms: [[arg('player', 'who', 'who')]] },
  {
    cmd: 'mode',
    aliases: ['gamemode'],
    desc: 'Switch between Survival and Creative',
    forms: [
      [
        arg('player', 'who', 'who'),
        opt('word', 'mode', 'survival/creative', { options: ['survival', 'creative'], aliases: { s: 'survival', c: 'creative' } })
      ]
    ]
  },
  {
    cmd: 'time',
    desc: 'Set the time of day, move it on, or let it run',
    forms: [
      [lit('set', 'Set the time'), arg('timeOfDay', 'when', 'when')],
      [lit('add', 'Move time on'), arg('duration', 'hours', 'hours')],
      [lit('auto', 'Let time run')],
      [lit('stop', 'Freeze the time')]
    ]
  },
  {
    cmd: 'tick',
    desc: 'Change the game speed',
    forms: [[opt('number', 'speed', 'speed', { min: 0.01, max: 1000, examples: ['0.5', '1', '2', '5', '10', '20'] })]]
  },
  {
    cmd: 'wind',
    desc: 'Set the wind speed, from 0 (calm) to 100 (a gale)',
    forms: [[opt('number', 'speed', '0-100', { min: 0, max: 100, invalid: (w) => `"${w}" isn't a wind speed: use 0 (calm) to 100 (a gale).` })]]
  },
  {
    cmd: 'weather',
    desc: 'Set the weather, or let it change on its own',
    forms: [[opt('word', 'type', 'type', { options: [...Object.keys(WEATHER_TYPES), 'auto'] })]]
  },
  {
    cmd: 'tp',
    desc: 'Teleport to a player, a spot, a biome or a world',
    ask: ['who', 'where'],
    forms: [
      [arg('player', 'who', 'who', { section: 'Teleport who' }), arg('player', 'to', 'where', { section: 'Go to a player' })],
      [arg('player', 'who', 'who'), arg('coord', 'x', 'x', { section: 'Go to coordinates' }), arg('coord', 'y', 'y')],
      [arg('player', 'who', 'who'), arg('place', 'place', 'place', { section: 'Go to a place' })],
      [arg('player', 'who', 'who'), arg('world', 'world', 'world', { section: 'Go to another world' }), arg('coord', 'x', 'x'), arg('coord', 'y', 'y')]
    ]
  },
  {
    cmd: 'fly',
    desc: 'Fly around (turns on Creative)',
    forms: [[arg('player', 'who', 'who'), opt('word', 'state', 'on/off', ON_OFF)]]
  },
  {
    cmd: 'noclip',
    desc: 'Fly through blocks',
    forms: [[arg('player', 'who', 'who'), opt('word', 'state', 'on/off', ON_OFF)]]
  },
  { cmd: 'setpos1', desc: 'Mark the first corner for /fill', forms: [[]] },
  { cmd: 'setpos2', desc: 'Mark the second corner for /fill', forms: [[]] },
  { cmd: 'setposclear', desc: 'Forget both /fill corners', forms: [[]] },
  {
    cmd: 'fill',
    desc: 'Fill the marked area (or between two corners) with a block',
    forms: [
      [arg('block', 'block', 'block', { section: 'Fill the marked area' }), opt('word', 'shape', 'solid/hollow', FILL_SHAPE)],
      [arg('block', 'block', 'block', { section: 'Fill the marked area' }), lit('replace', 'Replace a block'), arg('block', 'replace', 'block to replace')],
      [
        arg('coord', 'x1', 'x1', { section: 'Fill between corners' }),
        arg('coord', 'y1', 'y1'),
        arg('coord', 'x2', 'x2'),
        arg('coord', 'y2', 'y2'),
        arg('block', 'block'),
        opt('word', 'shape', 'solid/hollow', FILL_SHAPE)
      ],
      [
        arg('coord', 'x1', 'x1', { section: 'Fill between corners' }),
        arg('coord', 'y1', 'y1'),
        arg('coord', 'x2', 'x2'),
        arg('coord', 'y2', 'y2'),
        arg('block', 'block'),
        lit('replace', 'Replace a block'),
        arg('block', 'replace', 'block to replace')
      ]
    ]
  },
  { cmd: 'seed', desc: 'Regenerate the world from a seed', forms: [[opt('number', 'seed', 'seed', { integer: true })]] },
  {
    cmd: 'itemconfig',
    desc: 'Tune how dropped items behave',
    forms: [[arg('word', 'setting', 'setting', { options: Object.keys(ITEM_CONFIG) }), arg('number', 'value', 'value')]]
  },
  { cmd: 'lighting', desc: 'Recalculate the lighting', forms: [[], [lit('recalc', 'Recalculate')]] },
  {
    cmd: 'effect',
    desc: 'Give or clear effects',
    forms: [[arg('player', 'who', 'who'), arg('word', 'effect', 'light/clear', { options: ['light', 'clear'] })]]
  },
  {
    cmd: 'color',
    desc: "Colour a player's chat text and name tag",
    forms: [[arg('player', 'who', 'who'), arg('color', 'color', 'colour')]]
  },
  {
    cmd: 'dummy',
    desc: 'Spawn a fake player for testing',
    forms: [
      [arg('name', 'name')],
      [arg('name', 'name'), arg('coord', 'x', 'x', { section: 'Spawn at coordinates' }), arg('coord', 'y', 'y')],
      [arg('name', 'name'), lit('remove', 'Remove it')],
      [arg('name', 'name'), lit('crouch', 'Make it crouch')]
    ]
  },
  { cmd: 'name', chat: true, desc: 'Change your name', forms: [[arg('text', 'name', 'new name')]] },
  { cmd: 'say', chat: true, desc: 'Send a chat message', forms: [[arg('text', 'text', 'message')]] },
  { cmd: 'me', chat: true, desc: 'Say what you are doing', forms: [[arg('text', 'text', 'action')]] },
  { cmd: 'list', chat: true, desc: 'List the players here', forms: [[]] },
  { cmd: 'kick', host: true, desc: 'Send a player out of your game', forms: [[arg('guest', 'who', 'who'), opt('text', 'reason', 'reason')]] },
  { cmd: 'ban', host: true, desc: 'Kick a player and keep them out', forms: [[arg('anyName', 'who', 'who'), opt('text', 'reason', 'reason')]] },
  { cmd: 'unban', host: true, desc: 'Let a banned player back in', forms: [[arg('banned', 'who', 'who')]] },
  { cmd: 'banlist', host: true, desc: 'List the banned players', forms: [[]] },
  {
    cmd: 'perm',
    host: true,
    desc: 'Let a player build or use commands (or stop them)',
    forms: [[arg('guest', 'who', 'who'), arg('word', 'perm', 'build/commands', { options: ['build', 'commands'] }), arg('word', 'state', 'on/off', ON_OFF)]]
  },
  { cmd: 'help', chat: true, desc: 'Show the commands', forms: [[], [arg('command', 'command', 'command', { section: 'Commands' })]] },
  { cmd: 'log', desc: 'Save a performance report', forms: [[], [arg('word', 'reset', 'reset', { options: ['reset'], aliases: { clear: 'reset' } })]] }
];

function findCommand(name) {
  return availableCommands.find((c) => c.cmd === name || c.aliases?.includes(name)) || null;
}

// --- Matching what's typed against a command's forms ------------------------------------------
const typeOf = (a) => TYPES[a.type];

// Whether these complete words fit the start of a form.
function fitsStart(form, given) {
  for (let i = 0; i < given.length; i++) {
    const a = form[i];
    if (!a) return form.length > 0 && form[form.length - 1].type === 'text';
    if (a.type === 'text') return true;
    if (!typeOf(a).accepts(given[i], a)) return false;
  }
  return true;
}

// The arguments of the first form that the words fill completely, or null.
function parseForms(command, given) {
  for (const form of command.forms) {
    const textAt = form.findIndex((a) => a.type === 'text');
    const fixed = textAt >= 0 ? given.slice(0, textAt) : given;
    if (textAt < 0 && given.length > form.length) continue;
    const required = form.filter((a) => !a.optional).length;
    if (given.length < required) continue;
    if (!fitsStart(form, fixed)) continue;
    const args = {};
    fixed.forEach((w, i) => {
      const a = form[i];
      const t = typeOf(a);
      args[a.key] = t.parse ? t.parse(w, a) : w;
    });
    if (textAt >= 0) args[form[textAt].key] = given.slice(textAt).join(' ');
    return args;
  }
  return null;
}

const pillLabel = (a) => (a.optional ? `[${a.label}]` : a.label);
// Fixed words (like "set" in /time set) are written as they are; the rest in <> or [].
const usageWord = (a) => (a.key.startsWith('_') ? a.label : a.optional ? `[${a.label}]` : `<${a.label}>`);
function formUsage(command, form) {
  return `/${command.cmd}${form.map((a) => ' ' + usageWord(a)).join('')}`;
}

function commandUsage(command) {
  return command.forms.map((f) => formUsage(command, f)).join('  or  ');
}

// Why a word isn't right for its place. Fixed words from different forms (set, add, auto) are
// listed together; otherwise it's the first form's argument that says what it wanted (an
// argument can say it itself with `invalid`).
function invalidMessage(word, args) {
  if (args.every((a) => a.type === 'word')) {
    const options = [...new Set(args.flatMap((a) => a.options))];
    return options.length === 1 ? `Expected "${options[0]}", not "${word}".` : `"${word}" isn't one of: ${options.join(', ')}.`;
  }
  const a = args[0];
  return a.invalid ? a.invalid(word) : typeOf(a).invalid(word, a);
}

// Nothing fits: say which word is wrong (where the forms that fit longest stop fitting).
// (How a command is written shows in the suggestions while typing, and in /help.)
function usageFail(command, given = []) {
  const textForm = (f) => f.length && f[f.length - 1].type === 'text';
  // How far each form fits: the first word it won't take (or one past its end, for extra words).
  const stops = command.forms.map((f) => {
    for (let i = 0; i < given.length; i++) {
      if (!f[i]) return textForm(f) ? Infinity : i;
      if (f[i].type === 'text') return Infinity;
      if (!typeOf(f[i]).accepts(given[i], f[i])) return i;
    }
    return Infinity;
  });
  const at = Math.max(...stops);
  if (at === Infinity || at >= given.length) {
    commandFail(`/${command.cmd} needs more than that.`);
  } else {
    // The values the place that went wrong could have taken.
    // What that place takes, in the forms that got that far (the first form listed first).
    // Forms the other words fit (the right number of them, each a value its place takes) come
    // first: in /give qqq stone the bad word is the player, not the item.
    const restFits = (f) => {
      const textAt = f.findIndex((a) => a.type === 'text');
      if (textAt < 0 && (given.length > f.length || given.length < f.filter((a) => !a.optional).length)) return false;
      return given.every((w, i) => i === at || i >= (textAt < 0 ? f.length : textAt) || typeOf(f[i]).accepts(w, f[i]));
    };
    const reached = command.forms.filter((f, i) => stops[i] === at && f[at]);
    const ordered = reached.every((f) => f[at].type === 'word') ? reached : [...reached.filter(restFits), ...reached.filter((f) => !restFits(f))];
    const args = ordered.map((f) => f[at]);
    commandFail(args.length ? invalidMessage(given[at], args) : `"${given[at]}" is one word too many.`);
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// "/give <player> <item> [amount]": the command, then a pill per argument, the one at
// `active` (being typed) lit.
function formSignature(command, form, active = -1) {
  const pills = form
    .map((a, i) => `<span class="cmd-arg${a.optional ? ' optional' : ''}${i === active ? ' active' : ''}">${escapeHtml(pillLabel(a))}</span>`)
    .join('');
  return `<strong>/${command.cmd}</strong>${pills}`;
}

// The heading a kind of value is listed under in the suggestions.
const SECTION_NAMES = { player: 'Players', place: 'Places', world: 'Worlds', coord: 'Coordinates', item: 'Items', block: 'Blocks' };
const sectionOf = (a) => a.section || (a.type === 'word' ? (a.key.startsWith('_') ? 'Options' : a.key.charAt(0).toUpperCase() + a.key.slice(1)) : SECTION_NAMES[a.type] || a.label.charAt(0).toUpperCase() + a.label.slice(1));

export function updateCommandSuggestions() {
  game.commandSuggestions = [];
  game.itemSuggestions = [];
  const dropdown = document.getElementById('chatSuggestions');
  if (!dropdown) return;
  dropdown.innerHTML = '';
  if (!game.textInputValue.startsWith('/')) {
    dropdown.classList.add('hidden');
    return;
  }

  const parts = game.textInputValue.slice(1).split(' ');
  const commandPart = parts[0].toLowerCase();
  const command = parts.length > 1 ? findCommand(commandPart) : null;
  const addRow = (cls, html, onClick) => {
    const row = document.createElement('div');
    row.className = cls;
    row.innerHTML = html;
    if (onClick)
      row.addEventListener('click', () => {
        onClick(row);
        document.getElementById('chatInput')?.focus();
      });
    dropdown.appendChild(row);
    return row;
  };

  if (!command) {
    // Typing the command's name: the commands it could be, each with its shortest form.
    game.commandSuggestions = availableCommands.filter((c) => c.cmd.startsWith(commandPart));
    for (const c of game.commandSuggestions) {
      const shortest = c.forms.reduce((a, b) => (b.length < a.length ? b : a));
      const row = addRow('suggestion-item', `<div class="suggestion-text">${formSignature(c, shortest)}</div>`, applySuggestion);
      row.dataset.cmd = c.cmd;
    }
  } else {
    // The forms that still fit the words typed so far, with the argument being typed lit, and
    // the values that argument can take.
    const given = parts.slice(1, -1);
    const typed = parts[parts.length - 1].toLowerCase();
    const at = given.length;
    const fitting = command.forms.filter((f) => fitsStart(f, given) && (at < f.length || (f.length && f[f.length - 1].type === 'text')));
    const shown = fitting.length ? fitting : command.forms;
    // Just the command and what is being asked for next; the values follow under headings.
    const asking = [...new Set(shown.map((f) => f[at]?.label).filter(Boolean))];
    const prompt = command.ask?.[at] || asking.join(' · ');
    // What's typed so far as white pills, the word being typed lit, and (when only one form
    // still fits) the arguments still to come, dimmed.
    const done = given.map((w) => `<span class="cmd-arg done">${escapeHtml(w)}</span>`).join('');
    const upcoming = fitting.length === 1 ? fitting[0].slice(at + 1).map((a) => `<span class="cmd-arg optional">${escapeHtml(pillLabel(a))}</span>`).join('') : '';
    const hint = done + (prompt && fitting.length ? `<span class="cmd-arg active">${escapeHtml(prompt)}</span>${upcoming}` : '');
    addRow('suggestion-head', `<div class="suggestion-text"><strong>/${command.cmd}</strong>${hint}</div>`);
    const seen = new Set();
    for (const f of fitting) {
      const a = f[at];
      if (!a || a.type === 'text') continue;
      for (const c of typeOf(a).suggest(a)) {
        if (seen.has(c.id) || !(c.id.toLowerCase().startsWith(typed) || c.displayName.toLowerCase().includes(typed))) continue;
        seen.add(c.id);
        game.itemSuggestions.push({ ...c, section: sectionOf(a) });
      }
    }
    // Keep each section's values together, in the order the sections first appeared.
    const order = [...new Set(game.itemSuggestions.map((c) => c.section))];
    game.itemSuggestions.sort((x, y) => order.indexOf(x.section) - order.indexOf(y.section));
    game.itemSuggestions = game.itemSuggestions.slice(0, MAX_SUGGESTIONS);
    let section = null;
    for (const choice of game.itemSuggestions) {
      if (order.length > 1 && choice.section !== section) {
        section = choice.section;
        addRow('suggestion-section', escapeHtml(section));
      }
      const icon = choice.swatch
        ? `<span class="suggestion-icon suggestion-swatch" style="--swatch:${choice.swatch}"></span>`
        : choice.glyph
        ? `<svg class="suggestion-icon" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">${GLYPHS[choice.glyph]}</svg>`
        : choice.icon
        ? `<img src="assets/textures/${choice.id}.png" alt="" class="suggestion-icon" onerror="this.src='assets/textures/stone.png';">`
        : '';
      const id = choice.displayName !== choice.id ? ` <span class="suggestion-id">${escapeHtml(choice.id)}</span>` : '';
      const row = addRow(
        'suggestion-item',
        `${icon}<div class="suggestion-text"><strong>${escapeHtml(choice.displayName)}</strong>${id}</div>`,
        applySuggestion
      );
      row.dataset.id = choice.id;
    }
  }
  dropdown.classList.toggle('hidden', dropdown.children.length === 0);
}

function parseCoord(coord, defaultValue) {
  if (coord === undefined || coord === '~') return defaultValue;
  if (coord.startsWith('~')) {
    const offset = Number(coord.slice(1));
    return Number.isNaN(offset) ? defaultValue : defaultValue + offset;
  }
  const parsed = Number(coord);
  return Number.isNaN(parsed) ? defaultValue : Math.floor(parsed);
}

function fillArea(x1, y1, x2, y2, blockId, shape = 'solid', replaceBlock = null) {
  const clampX = (x) => Math.max(0, Math.min(game.world.width - 1, x));
  const clampY = (y) => Math.max(0, Math.min(game.world.height - 1, y));
  const minX = Math.min(clampX(x1), clampX(x2));
  const maxX = Math.max(clampX(x1), clampX(x2));
  const minY = Math.min(clampY(y1), clampY(y2));
  const maxY = Math.max(clampY(y1), clampY(y2));
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      if (shape === 'hollow' && x !== minX && x !== maxX && y !== minY && y !== maxY) continue;
      if (replaceBlock && game.world.getBlockId(x, y) !== replaceBlock) continue;
      game.world.setBlock(x, y, blockId, null);
    }
  }
}

export function commandsAllowed() {
  // Also a world made in Creative, so /mode can switch back after going to Survival.
  return !!(game.creativeMode || game.worldGameMode === 'creative' || game.world?.allowCommands || game.world?.cheatsEnabled);
}

// --- Command feedback: every command says what it did (or what was wrong) in the chat log.
export function commandOk(text) {
  addChatLine(text);
}

export function commandFail(text) {
  addChatLine(text, null, 'error');
}

function commandInfo(text) {
  addChatLine(text, null, 'info');
}

const itemLabel = (id) => registry.get(id)?.displayName || id;

const playerLabel = (targets) => (targets.length === 1 ? (targets[0].self ? 'you' : targets[0].name) : `${targets.length} players`);

const clockText = (fraction) => {
  const minutes = Math.round((((fraction % 1) + 1) % 1) * 24 * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

function processTextInputCommand(text) {
  const trimmed = text.trim();
  if (!trimmed || !game.world || !game.player) return;

  // Anything that isn't a /command is a chat message.
  if (!trimmed.startsWith('/')) {
    multiplayer.sendChat(trimmed);
    return;
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const name = parts[0].toLowerCase();
  const command = findCommand(name === '?' ? 'help' : name);
  if (!command) return commandFail(`Unknown command "/${parts[0]}". Type /help for the list.`);

  // Chatting commands work everywhere; the host's moderation commands only for the host; the
  // rest need commands turned on for the world (and the host's say-so, as a guest).
  if (command.host && !multiplayer.isHost) return commandFail(`Only the host of a multiplayer game can use /${command.cmd}.`);
  if (!command.chat && !command.host) {
    if (!commandsAllowed()) return commandFail('Commands are turned off in this world.');
    if (!multiplayer.canUseCommands()) return commandFail("The host hasn't let you use commands.");
  }

  const args = parseForms(command, parts.slice(1));
  if (!args) return usageFail(command, parts.slice(1));
  const run = HANDLERS[command.cmd];
  run(args, command);
}

// The players a command is for: the one named, or you.
function targetsOf(args) {
  const found = resolvePlayers(args.who);
  if (!found.length || !found[0]) {
    commandFail(`No player called "${args.who}" is here.`);
    return null;
  }
  return found;
}

const tileX = () => Math.floor(game.player.x / TILE_SIZE);
const tileY = () => Math.floor(game.player.y / TILE_SIZE);

// What each command does, given its arguments (by key) from the form it was written in.
const HANDLERS = {
  say(a) {
    multiplayer.sendChat(a.text);
  },

  me(a) {
    multiplayer.sendChat(a.text, true);
  },

  help(a) {
    if (a.command) {
      commandInfo(commandUsage(a.command));
      if (a.command.desc) commandInfo(a.command.desc);
      return;
    }
    commandInfo('Commands: ' + availableCommands.map((c) => '/' + c.cmd).join(' '));
    commandInfo('Type /help <command> for how to use one.');
  },

  list() {
    const names = commandPlayers().map((p) => p.name);
    commandInfo(`${names.length} player${names.length === 1 ? '' : 's'} here: ${names.join(', ')}`);
    // The host also sees what each guest is allowed to do.
    for (const g of multiplayer.isHost ? multiplayer.guests() : []) {
      commandInfo(`${g.name}: building ${g.perms.build ? 'on' : 'off'}, commands ${g.perms.commands ? 'on' : 'off'}`);
    }
  },

  give(a) {
    const targets = targetsOf(a);
    if (!targets) return;
    const amount = a.amount ?? 1;
    for (const t of targets) actOnPlayer(t, { k: 'give', id: a.item, n: amount });
    commandOk(`Gave ${amount} ${itemLabel(a.item)} to ${playerLabel(targets)}.`);
  },

  giveall(a) {
    const targets = targetsOf(a);
    if (!targets) return;
    const ids = itemCategoryIds(a.group);
    for (const t of targets) for (const id of ids) actOnPlayer(t, { k: 'give', id, n: registry.isItem(id) ? 1 : 24 });
    commandOk(`Gave ${playerLabel(targets)} everything in ${a.group} (${ids.length} kinds).`);
  },

  giverandom(a) {
    const targets = targetsOf(a);
    if (!targets) return;
    const count = a.count ?? 1;
    const ids = [...registry.entries()].filter(([id, d]) => id !== 'air' && id !== 'water' && !d.hidden).map(([id]) => id);
    for (const t of targets) for (let i = 0; i < count; i++) actOnPlayer(t, { k: 'give', id: ids[Math.floor(Math.random() * ids.length)], n: 1 });
    commandOk(`Gave ${playerLabel(targets)} ${count} random item${count === 1 ? '' : 's'}.`);
  },

  clear(a) {
    const targets = targetsOf(a);
    if (!targets) return;
    for (const t of targets) actOnPlayer(t, { k: 'clear' });
    commandOk(`Cleared ${playerLabel(targets) === 'you' ? 'your' : playerLabel(targets) + "'s"} inventory.`);
  },

  mode(a) {
    const targets = targetsOf(a);
    if (!targets) return;
    // No mode given: each player switches to the other one.
    for (const t of targets) actOnPlayer(t, { k: 'mode', c: a.mode ? a.mode === 'creative' : t.self ? !game.creativeMode : null });
    const word = a.mode === 'creative' ? 'Creative' : a.mode === 'survival' ? 'Survival' : null;
    commandOk(word ? `Set ${playerLabel(targets)} to ${word} mode.` : `Switched ${playerLabel(targets)} between Survival and Creative.`);
  },

  color(a) {
    const targets = targetsOf(a);
    if (!targets) return;
    for (const t of targets) actOnPlayer(t, { k: 'color', c: a.color });
    commandOk(a.color ? `Set the colour of ${playerLabel(targets)} to ${a.color}.` : `Reset the colour of ${playerLabel(targets)}.`);
  },

  name(a) {
    if (multiplayer.active) return commandFail("You can't change your name in a multiplayer game.");
    const name = String(a.name || '').trim();
    if (!name) return commandFail('Give a name: /name <new name>.');
    if (name.length > 20) return commandFail('Names can be up to 20 letters.');
    commandOk(`Your name is now ${setPlayerName(name)}.`);
  },

  effect(a) {
    const targets = targetsOf(a);
    if (!targets) return;
    for (const t of targets) actOnPlayer(t, { k: 'effect', name: a.effect });
    const who = playerLabel(targets);
    commandOk(a.effect === 'clear' ? `Cleared the effects on ${who}.` : `${who === 'you' ? 'You' : who} can see in the dark now.`);
  },

  fly(a, command) {
    const targets = targetsOf(a);
    if (!targets) return;
    const on = a.state === undefined ? null : a.state === 'on';
    for (const t of targets) actOnPlayer(t, { k: command.cmd, on });
    const label = command.cmd === 'fly' ? 'Flying' : 'No-clip';
    commandOk(on === null ? `Toggled ${label.toLowerCase()} for ${playerLabel(targets)}.` : `${label} is ${on ? 'on' : 'off'} for ${playerLabel(targets)}.`);
  },

  noclip(a, command) {
    HANDLERS.fly(a, command);
  },

  time(a) {
    // The time moves to the new one over a few seconds (the sun and sky run on, they don't
    // jump); see game.timeGlide in loop.js.
    const glideTime = (distance) => {
      const d = ((distance % game.world.dayLength) + game.world.dayLength) % game.world.dayLength;
      game.timeGlide = d > 1 ? { left: d, rate: d / TIME_GLIDE_SECONDS } : null;
      if (!game.timeGlide) game.world.time = (game.world.time + d) % game.world.dayLength;
    };
    const world = game.world;
    const day = world.dayLength;
    const everyWorld = (fn) => {
      fn(world);
      for (const w of game.dimensionManager?.dimensions.values() || []) if (w && w !== world) fn(w);
    };
    if (a._stop) {
      everyWorld((w) => (w.timeManuallySet = true));
      multiplayer.sendTime(true);
      commandOk(`The time is frozen at ${clockText(world.time / day)}. Use /time auto to let it run.`);
    } else if (a._auto) {
      everyWorld((w) => (w.timeManuallySet = false));
      multiplayer.sendTime(false);
      commandOk('The time is passing on its own.');
    } else if (a._add) {
      glideTime((a.hours / 24) * day);
      multiplayer.sendTime(world.timeManuallySet);
      commandOk(`Moving the time on to ${clockText((((world.time + (a.hours / 24) * day) % day) + day) % day / day)}.`);
    } else {
      glideTime((((a.when * day - world.time) % day) + day) % day);
      multiplayer.sendTime(world.timeManuallySet);
      commandOk(`Setting the time to ${clockText(a.when)}.`);
    }
  },

  tick(a) {
    game.gameSpeed = a.speed ?? 1;
    commandOk(`Game speed is now ${game.gameSpeed}x.`);
  },

  weather(a) {
    // /weather shows it; /weather <clear|rain|storm|snow|snowstorm> sets it (and stops it changing by itself);
    // /weather auto lets it change on its own again.
    if (a.type === undefined) return commandInfo(`The weather is ${weather.type}${weather.auto ? ' (changing on its own)' : ''}.`);
    if (a.type === 'auto') {
      weather.auto = true;
      weather.untilChange = 60;
      multiplayer.sendWeather('auto');
      return commandOk('The weather now changes on its own.');
    }
    weather.auto = false;
    weather.set(a.type);
    multiplayer.sendWeather(a.type);
    commandOk(`The weather is turning to ${a.type}.`);
  },

  wind(a) {
    // /wind shows the speed; /wind <0-100> sets it (for everyone, in multiplayer).
    if (a.speed === undefined) return commandInfo(`The wind speed is ${wind.speed} (0 calm, 100 a gale).`);
    wind.set(a.speed);
    multiplayer.sendWind(wind.speed);
    commandOk(`Set the wind speed to ${wind.speed}.`);
  },

  dummy(a) {
    // A fake player for testing, here on your screen only.
    const name = a.name.slice(0, 20);
    if (a._crouch) {
      const dummy = multiplayer.findDummy(name);
      if (!dummy) return commandFail(`There's no dummy called ${name}.`);
      dummy.crouching = !dummy.crouching;
      return commandOk(`${name} is ${dummy.crouching ? 'crouching' : 'standing'}.`);
    }
    if (a._remove) return commandOk(multiplayer.removeDummy(name) ? `Removed dummy ${name}.` : `There's no dummy called ${name}.`);
    let x, y;
    if (a.x !== undefined) {
      x = parseCoord(a.x, tileX()) * TILE_SIZE;
      y = parseCoord(a.y, tileY()) * TILE_SIZE;
    } else {
      // No position: 3 to 5 blocks to one side of you, lifted out of the ground if it's inside it.
      const bodyFree = (px, py) => {
        for (let tx = Math.floor(px / TILE_SIZE); tx <= Math.floor((px + 11) / TILE_SIZE); tx++) {
          for (let ty = Math.floor(py / TILE_SIZE); ty <= Math.floor((py + 31) / TILE_SIZE); ty++) {
            if (game.world.isSolidAt(tx, ty)) return false;
          }
        }
        return true;
      };
      const side = Math.random() < 0.5 ? -1 : 1;
      const distance = 3 + Math.floor(Math.random() * 3);
      for (const dir of [side, -side]) {
        const px = game.player.x + dir * distance * TILE_SIZE;
        let py = game.player.y;
        for (let i = 0; i < 16 && !bodyFree(px, py); i++) py -= TILE_SIZE;
        if (bodyFree(px, py)) {
          x = px;
          y = py;
          break;
        }
      }
      if (x === undefined) {
        x = game.player.x;
        y = game.player.y - 3 * TILE_SIZE;
      }
    }
    multiplayer.spawnDummy(name, x, y);
    commandOk(`Spawned dummy ${name}.`);
  },

  tp(a) {
    const who = targetsOf(a);
    if (!who) return;
    // /tp <player> <player>: send the first to the second.
    if (a.to) {
      const dest = resolvePlayers(a.to)[0];
      for (const t of who) if (t.id !== dest.id || t.self !== dest.self) actOnPlayer(t, { k: 'tp', x: dest.x, y: dest.y });
      return commandOk(`Teleported ${playerLabel(who)} to ${dest.self ? 'you' : dest.name}.`);
    }
    // /tp <player> <place> and /tp <player> <world> <x> <y>: finding the spot happens in your
    // own game, so these are for you.
    if (a.place || a.world) {
      if (who.length !== 1 || !who[0].self) return commandFail('Only you can be sent to a place or another world.');
      if (a.place) return teleportToPlace(a.place);
      return teleportToDimension(a.world, parseCoord(a.x, tileX()), parseCoord(a.y, tileY()));
    }
    // /tp <player> <x> <y>
    const x = parseCoord(a.x, tileX()) * TILE_SIZE;
    const y = parseCoord(a.y, tileY()) * TILE_SIZE;
    for (const t of who) actOnPlayer(t, { k: 'tp', x, y });
    commandOk(`Teleported ${playerLabel(who)} to ${Math.floor(x / TILE_SIZE)}, ${Math.floor(y / TILE_SIZE)}.`);
  },

  setpos1(a, command) {
    const spot = { x: tileX(), y: Math.floor((game.player.y + game.player.height) / TILE_SIZE) };
    if (command.cmd === 'setpos1') game.setPosition1 = spot;
    else game.setPosition2 = spot;
    commandOk(`Position ${command.cmd === 'setpos1' ? 1 : 2} set to ${spot.x}, ${spot.y}.`);
  },

  setpos2(a, command) {
    HANDLERS.setpos1(a, command);
  },

  setposclear() {
    game.setPosition1 = null;
    game.setPosition2 = null;
    commandOk('Both positions cleared.');
  },

  fill(a) {
    // Between two corners given, or /setpos1 and /setpos2 (or where you are).
    let x1, y1, x2, y2;
    if (a.x1 !== undefined) {
      [x1, y1, x2, y2] = [parseCoord(a.x1, tileX()), parseCoord(a.y1, tileY()), parseCoord(a.x2, tileX()), parseCoord(a.y2, tileY())];
    } else {
      if (!game.setPosition1) return commandFail('Set a corner first with /setpos1 (and /setpos2), or give coordinates.');
      const end = game.setPosition2 || { x: tileX(), y: tileY() };
      [x1, y1, x2, y2] = [game.setPosition1.x, game.setPosition1.y, end.x, end.y];
    }
    fillArea(x1, y1, x2, y2, a.block, a.shape || 'solid', a.replace || null);
    commandOk(a.replace ? `Replaced ${itemLabel(a.replace)} with ${itemLabel(a.block)}.` : `Filled the area with ${itemLabel(a.block)}.`);
  },

  seed(a) {
    const newSeed = a.seed ?? Math.floor(Math.random() * 2147483647);
    game.currentSeed = newSeed;
    game.world.seed = newSeed;
    tpVisited.clear();
    game.world.resetChunks();
    game.items.length = 0;
    game.lastPreloadChunk = null;
    const centerX = Math.floor(game.world.width / 2);
    loadInitialChunks(centerX).then(() => placePlayerAtSurface(centerX));
    commandOk(`New world from seed ${newSeed}.`);
  },

  itemconfig(a) {
    const [key, fix] = ITEM_CONFIG[a.setting];
    ItemEntity.updateConfig({ [key]: fix(a.value) });
    commandOk(`Set ${a.setting} to ${fix(a.value)}.`);
  },

  lighting() {
    game.world.initializeLighting();
    commandOk('Recalculated the lighting.');
  },

  log(a) {
    if (a.reset) {
      perf.reset();
      return commandOk('Reset the performance history.');
    }
    const res = perf.downloadReport();
    if (res?.success) {
      const top = res.topBottleneck ? ` Top bottleneck: ${res.topBottleneck}.` : '';
      commandOk(`Saved performance report (${res.filename}). Avg: ${res.avgFps} FPS (${res.avgFrameMs}ms).${top}`);
    } else if (res?.avgFps) {
      commandOk(`Performance report logged to the console. Avg: ${res.avgFps} FPS (${res.avgFrameMs}ms). Top: ${res.topBottleneck}.`);
    } else {
      commandFail('Could not save the performance report.');
    }
  },

  // --- The host's moderation ---
  kick(a) {
    const guest = multiplayer.findGuest(a.who);
    multiplayer.kick(guest.id, a.reason ? `Kicked: ${a.reason.slice(0, 100)}` : undefined);
    commandOk(`Kicked ${guest.name}.`);
  },

  ban(a) {
    const entry = multiplayer.ban(a.who, a.reason ? `Banned: ${a.reason.slice(0, 100)}` : undefined);
    commandOk(`Banned ${entry.name}.`);
  },

  unban(a) {
    multiplayer.unban(a.who);
    commandOk(`Unbanned ${a.who}.`);
  },

  banlist() {
    const names = multiplayer.game.bans().map((b) => b.name);
    commandInfo(names.length ? `Banned: ${names.join(', ')}` : 'No one is banned.');
  },

  perm(a) {
    const guest = multiplayer.findGuest(a.who);
    multiplayer.setPermission(guest.id, a.perm, a.state === 'on');
    commandOk(`${guest.name} ${a.state === 'on' ? 'can' : "can't"} ${a.perm === 'build' ? 'build' : 'use commands'} now.`);
  }
};

// /tp <place>: another world, the nearest fallen tree or lake, or the nearest edge of the
// closest zone of a biome. Each repeat goes somewhere new.
function teleportToPlace(place) {
  const query = place.toLowerCase();
  const dimId = resolveDimensionId(query);
  if (dimId) return teleportToDimension(dimId);
  const world = game.world;
  const px = tileX();
  const wantsFallen = FALLEN_WORDS.includes(query);
  const wantsWater = WATER_WORDS.includes(query);
  const biomeId = wantsFallen || wantsWater ? null : findBiomeId(query);
  // Skip spots already teleported to (and the one you're in).
  const visitKey = wantsFallen ? 'fallen' : wantsWater ? 'water' : biomeId;
  const visited = tpVisited.get(visitKey) || new Set();
  tpVisited.set(visitKey, visited);
  let edgeX = null;
  if (wantsWater) {
    const found = nearestLakeX(px, world.seed ?? 0, world.width, world.height, world.worldType || 'regular', (c) => visited.has(c) || Math.abs(c - px) < 80);
    if (found) {
      visited.add(found.center);
      edgeX = found.standX;
    }
  } else if (wantsFallen) {
    const found = nearestFallenTreeX(
      px,
      world.seed ?? 0,
      world.width,
      world.height,
      world.worldType || 'regular',
      30000,
      (s) => visited.has(s) || Math.abs(s - px) <= 3
    );
    if (found) {
      visited.add(found.stumpX);
      edgeX = found.standX;
    }
  } else {
    const here = Math.floor(px / BIOME_ZONE);
    const outsideWorld = (zone) => zone * BIOME_ZONE < 2 || (zone + 1) * BIOME_ZONE > world.width - 2;
    edgeX = nearestBiomeEdge(px, world.seed ?? 0, biomeId, 400, (zone) => visited.has(zone) || zone === here || outsideWorld(zone));
    if (edgeX !== null) visited.add(Math.floor(edgeX / BIOME_ZONE));
  }
  const label = wantsFallen ? 'fallen tree' : wantsWater ? 'lake' : BIOMES[biomeId]?.name || query;
  if (edgeX === null) return commandFail(`Couldn't find a ${label} nearby.`);
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.cancelFall();
  game.lastPreloadChunk = null;
  loadInitialChunks(edgeX).then(() => placePlayerAtSurface(edgeX));
  commandOk(`Teleported you to the nearest ${label}.`);
}

function setChatValue(value) {
  game.textInputValue = value;
  const chatInput = document.getElementById('chatInput');
  if (chatInput) chatInput.value = value;
}

export function closeChat() {
  game.textInputMode = false;
  game.textInputValue = '';
  game.commandSuggestions = [];
  game.itemSuggestions = [];
  if (game.player) game.player.inputLocked = false;
  const chat = document.getElementById('chat');
  if (chat) chat.classList.add('hidden');
  document.getElementById('chatArea')?.classList.remove('chat-open');
  collapseChatHistory();
  const suggestions = document.getElementById('chatSuggestions');
  if (suggestions) suggestions.classList.add('hidden');
  const chatInput = document.getElementById('chatInput');
  if (chatInput) chatInput.blur();
}

export function openChat(initialValue) {
  game.textInputMode = true;
  if (game.player) game.player.inputLocked = true;
  const chat = document.getElementById('chat');
  if (chat) chat.classList.remove('hidden');
  document.getElementById('chatArea')?.classList.add('chat-open');
  const chatLog = document.getElementById('chatLog');
  if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
  setChatValue(initialValue);
  updateCommandSuggestions();
  const chatInput = document.getElementById('chatInput');
  if (chatInput) chatInput.focus();
}

function applySuggestion(element) {
  if (element.dataset.cmd) {
    setChatValue(`/${element.dataset.cmd} `);
  } else if (element.dataset.id) {
    const parts = game.textInputValue.slice(1).split(' ');
    parts[Math.max(1, parts.length - 1)] = element.dataset.id;
    setChatValue('/' + parts.join(' ') + ' ');
  }
  updateCommandSuggestions();
}

export function handleChatKey(e) {
  const dropdown = document.getElementById('chatSuggestions');
  const suggestionItems = dropdown && !dropdown.classList.contains('hidden') ? Array.from(dropdown.querySelectorAll('.suggestion-item')) : [];
  const currentIndex = suggestionItems.findIndex((item) => item.classList.contains('selected'));

  // Phone keyboards often send Enter with no key code (only e.key), and the last word can
  // still be in the keyboard's suggestion bar, so read the box itself.
  const isEnter = e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter' || e.keyCode === 13;
  const chatBox = document.getElementById('chatInput');
  let stale = false;
  if (isEnter && chatBox && chatBox.value !== game.textInputValue) {
    // The suggestions were for older text: redo them for what's really typed.
    game.textInputValue = chatBox.value;
    updateCommandSuggestions();
    stale = true;
  }

  if (e.code === 'Escape' || e.key === 'Escape') {
    closeChat();
    e.preventDefault();
    return;
  }

  if (isEnter) {
    // Enter on a suggestion picked with Tab (or the arrows) fills it in; with none picked it sends.
    const fresh = stale ? Array.from(dropdown?.querySelectorAll('.suggestion-item') || []) : suggestionItems;
    const picked = stale ? -1 : currentIndex;
    if (game.textInputValue.startsWith('/') && picked >= 0 && fresh[picked]) {
      applySuggestion(fresh[picked]);
      e.preventDefault();
      return;
    }
    const command = game.textInputValue;
    if (command.trim()) {
      chatHistory.push(command);
      if (chatHistory.length > 20) chatHistory.shift();
    }
    game.chatHistoryIndex = -1;
    closeChat();
    processTextInputCommand(command);
    e.preventDefault();
    return;
  }

  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    const up = e.code === 'ArrowUp';
    if (suggestionItems.length > 0) {
      suggestionItems.forEach((item) => item.classList.remove('selected'));
      const len = suggestionItems.length;
      const next = up ? (currentIndex <= 0 ? len - 1 : currentIndex - 1) : (currentIndex + 1) % len;
      suggestionItems[next].classList.add('selected');
    } else if (up && game.chatHistoryIndex < chatHistory.length - 1) {
      game.chatHistoryIndex++;
      setChatValue(chatHistory[chatHistory.length - 1 - game.chatHistoryIndex]);
    } else if (!up && game.chatHistoryIndex > 0) {
      game.chatHistoryIndex--;
      setChatValue(chatHistory[chatHistory.length - 1 - game.chatHistoryIndex]);
    } else if (!up && game.chatHistoryIndex === 0) {
      game.chatHistoryIndex = -1;
      setChatValue('');
    }
    e.preventDefault();
    return;
  }

  if (e.code === 'Tab') {
    // Tab steps through the suggestions (Shift+Tab backwards); Enter then fills the one picked in.
    if (suggestionItems.length > 0) {
      const len = suggestionItems.length;
      const next = e.shiftKey ? (currentIndex <= 0 ? len - 1 : currentIndex - 1) : (currentIndex + 1) % len;
      suggestionItems.forEach((item) => item.classList.remove('selected'));
      suggestionItems[next].classList.add('selected');
      suggestionItems[next].scrollIntoView({ block: 'nearest' });
    }
    e.preventDefault();
  }
}
