// /menu: a floating panel (drag the title bar) of buttons that run
// common commands: game mode, time of day, weather, colour, world, and the /fill corners.
import { NAMED_COLORS } from '../game/players.js';
import { listDimensions } from '../core/dimensions.js';
import { WEATHER_TYPES } from '../core/weather.js';

const svg = (body) => `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  mode: svg('<path d="M4 20 20 4"/><path d="M14 4h6v6"/><path d="M4 4l5 5"/>'),
  time: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'),
  weather: svg('<path d="M7 16a4 4 0 0 1 0-8 5 5 0 0 1 9.6 1A3.5 3.5 0 0 1 17 16z"/><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2"/>'),
  color: svg('<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s0-2.5 1.5-2.5H17a4 4 0 0 0 4-4C21 6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="11" cy="7.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/>'),
  world: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
  pos1: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/><path d="M19 15v6M17 18h4" />'),
  pos2: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/><path d="M16.5 16.5h3v2l-3 2.5h3"/>')
};

const TIMES = ['dawn', 'day', 'sunset', 'night'];
const WEATHERS = [...Object.keys(WEATHER_TYPES), 'auto'];
const COLORS = Object.keys(NAMED_COLORS);
const cycles = { time: 0, weather: 0, color: 0, world: 0 };

let panel = null;

const next = (key, list) => list[(cycles[key]++) % list.length];

export function closeCommandMenu() {
  panel?.remove();
  panel = null;
}

export function toggleCommandMenu(run) {
  if (panel) {
    panel.remove();
    panel = null;
    return;
  }
  const worlds = listDimensions().map((d) => d.id);
  const buttons = [
    { icon: 'mode', label: 'Game mode', sub: 'Survival / Creative', go: () => run('/mode') },
    { icon: 'time', label: 'Time of day', sub: 'Next time', go: () => run(`/time set ${next('time', TIMES)}`) },
    { icon: 'weather', label: 'Weather', sub: 'Next weather', go: () => run(`/weather ${next('weather', WEATHERS)}`) },
    { icon: 'color', label: 'Colour', sub: 'Next chat colour', go: () => run(`/color ${next('color', COLORS)}`) },
    { icon: 'world', label: 'World', sub: 'Next world', go: () => run(`/tp self ${next("world", worlds)} ~ ~`) },
    { icon: 'pos1', label: 'Set pos 1', sub: 'First corner', go: () => run('/setpos1') },
    { icon: 'pos2', label: 'Set pos 2', sub: 'Second corner', go: () => run('/setpos2') }
  ];

  panel = document.createElement('div');
  panel.className = 'cmd-menu';
  panel.innerHTML = `<div class="cmd-menu-title"><span>Menu</span><button type="button" class="cmd-menu-close" aria-label="Close">&times;</button></div><div class="cmd-menu-grid"></div>`;
  const grid = panel.querySelector('.cmd-menu-grid');
  for (const b of buttons) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cmd-menu-btn';
    el.title = b.label;
    el.setAttribute('aria-label', b.label);
    el.innerHTML = ICONS[b.icon];
    el.addEventListener('click', b.go);
    grid.appendChild(el);
  }
  panel.querySelector('.cmd-menu-close').addEventListener('click', () => toggleCommandMenu(run));
  document.body.appendChild(panel);

  const drag = (handle, onMove) => {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.cmd-menu-close')) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const r = panel.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY;
      const move = (m) => onMove(r, m.clientX - sx, m.clientY - sy);
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  };
  drag(panel.querySelector('.cmd-menu-title'), (r, dx, dy) => {
    panel.style.left = Math.max(0, Math.min(innerWidth - 60, r.left + dx)) + 'px';
    panel.style.top = Math.max(0, Math.min(innerHeight - 30, r.top + dy)) + 'px';
  });
}
