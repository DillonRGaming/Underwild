// On-screen controls for phones and tablets: a movement pad on the left, action buttons on
// the right (jump, down, sprint, break, use) and a "..." button by the hotbar for the
// inventory. Touching the world moves the aim (the crosshair), which is what break and use
// act on. They drive the same keys and mouse state the keyboard and mouse do.

const PAD_DEAD_ZONE = 0.3; // share of the pad's radius before the stick counts as pushed

const ICONS = {
  up: '<path d="M8 3 L13 9 H10 V13 H6 V9 H3 Z"/>',
  down: '<path d="M8 13 L13 7 H10 V3 H6 V7 H3 Z"/>',
  sprint: '<path d="M2 3 L7 8 L2 13 Z M8 3 L13 8 L8 13 Z"/>',
  sword: '<path d="M13 2 H15 V4 L7 12 L5 10 Z M4 9 L7 12 L6 13 L5 12 L3 14 L2 13 L4 11 L3 10 Z"/>',
  hand: '<path d="M6 2 H8 V7 H9 V5 H11 V7 H12 V6 H14 V11 L12 14 H6 L3 10 L4 9 L6 10 Z"/>'
};

export function isTouchDevice() {
  // ?touch in the address forces them on (for trying them out on a computer).
  if (typeof location !== 'undefined' && /[?&]touch\b/.test(location.search)) return true;
  return (typeof window !== 'undefined') && (('ontouchstart' in window) || navigator.maxTouchPoints > 0)
    && window.matchMedia?.('(pointer: coarse)').matches;
}

export function setupTouchControls({ canvas, input, keybinds, inGame, onInventory, uiOpen, closeUI }) {
  if (!isTouchDevice() || document.getElementById('touchControls')) return null;
  document.body.classList.add('touch-mode');

  const root = document.createElement('div');
  root.id = 'touchControls';
  root.innerHTML = `
    <div class="touch-pad"><div class="touch-pad-stick"></div></div>
    <div class="touch-crosshair"></div>
    <div class="touch-buttons">
      <button class="touch-btn touch-sprint" data-act="sprint">${svg('sprint')}</button>
      <button class="touch-btn touch-jump" data-act="jump">${svg('up')}</button>
      <button class="touch-btn touch-down" data-act="down">${svg('down')}</button>
      <button class="touch-btn touch-break" data-act="break">${svg('sword')}</button>
      <button class="touch-btn touch-use" data-act="use">${svg('hand')}</button>
    </div>
    <button class="touch-btn touch-more" data-act="inventory">&middot;&middot;&middot;</button>`;
  document.body.appendChild(root);
  canvas.style.touchAction = 'none';

  const keyDown = (code) => {
    if (input.keys.has(code)) return;
    input.keys.add(code);
    const list = input.presses.get(code) || [];
    list.push(performance.now());
    if (list.length > 8) list.shift();
    input.presses.set(code, list);
  };
  const keyUp = (code) => input.keys.delete(code);

  // The aim point, in canvas pixels, and the same point on screen.
  const aim = { x: canvas.width / 2, y: canvas.height / 2 };
  const crosshair = root.querySelector('.touch-crosshair');
  const setAim = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    aim.x = (clientX - rect.left) * (canvas.width / rect.width);
    aim.y = (clientY - rect.top) * (canvas.height / rect.height);
    input.mouse.x = aim.x;
    input.mouse.y = aim.y;
  };
  const aimClient = () => {
    const rect = canvas.getBoundingClientRect();
    return { clientX: rect.left + aim.x * rect.width / canvas.width, clientY: rect.top + aim.y * rect.height / canvas.height };
  };
  // Break and use press the mouse at the aim point, so the game's own click handling runs.
  const mouse = (type, button) => {
    const target = type === 'mouseup' ? window : canvas;
    target.dispatchEvent(new MouseEvent(type, { ...aimClient(), button, bubbles: true }));
  };

  // --- Movement pad ---
  const pad = root.querySelector('.touch-pad');
  const stick = root.querySelector('.touch-pad-stick');
  let padTouch = null;
  const movePad = (t) => {
    const rect = pad.getBoundingClientRect();
    const r = rect.width / 2;
    let dx = (t.clientX - rect.left - r) / r;
    let dy = (t.clientY - rect.top - r) / r;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    stick.style.transform = `translate(${dx * r * 0.45}px, ${dy * r * 0.45}px)`;
    (dx > PAD_DEAD_ZONE ? keyDown : keyUp)(keybinds.right);
    (dx < -PAD_DEAD_ZONE ? keyDown : keyUp)(keybinds.left);
    // Up on the pad climbs ladders / flies up; down goes down.
    (dy < -0.6 ? keyDown : keyUp)(keybinds.forward);
    (dy > 0.6 ? keyDown : keyUp)(keybinds.backward);
  };
  const releasePad = () => {
    padTouch = null;
    stick.style.transform = '';
    for (const k of [keybinds.right, keybinds.left, keybinds.forward, keybinds.backward]) keyUp(k);
  };
  pad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    padTouch = t.identifier;
    movePad(t);
  }, { passive: false });
  pad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === padTouch) movePad(t);
  }, { passive: false });
  pad.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === padTouch) releasePad(); });
  pad.addEventListener('touchcancel', releasePad);

  // --- Buttons ---
  let sprinting = false;
  const sprintBtn = root.querySelector('.touch-sprint');
  for (const btn of root.querySelectorAll('.touch-btn')) {
    const act = btn.dataset.act;
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      btn.classList.add('pressed');
      if (act === 'jump') keyDown(keybinds.jump);
      else if (act === 'down') keyDown(keybinds.crouch);
      else if (act === 'break') mouse('mousedown', 0);
      else if (act === 'use') mouse('mousedown', 2);
      else if (act === 'inventory') onInventory();
      else if (act === 'sprint') {
        sprinting = !sprinting;
        sprintBtn.classList.toggle('on', sprinting);
        (sprinting ? keyDown : keyUp)(keybinds.sprint);
      }
    }, { passive: false });
    const up = (e) => {
      e.preventDefault();
      btn.classList.remove('pressed');
      if (act === 'jump') keyUp(keybinds.jump);
      else if (act === 'down') keyUp(keybinds.crouch);
      else if (act === 'break') mouse('mouseup', 0);
      else if (act === 'use') mouse('mouseup', 2);
    };
    btn.addEventListener('touchend', up, { passive: false });
    btn.addEventListener('touchcancel', up, { passive: false });
  }

  // --- Aiming: touch (and drag on) the world ---
  canvas.addEventListener('touchstart', (e) => {
    if (!inGame()) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    setAim(t.clientX, t.clientY);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!inGame()) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    setAim(t.clientX, t.clientY);
  }, { passive: false });

  // Tap a hotbar slot to select it.
  document.getElementById('hotbar')?.addEventListener('touchstart', (e) => {
    const slot = e.target.closest?.('.hotbar-slot');
    if (!slot) return;
    e.preventDefault();
    const n = Number(slot.dataset.index) + 1;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: `Digit${n}`, key: String(n), bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: `Digit${n}`, key: String(n), bubbles: true }));
  }, { passive: false });

  // An X to close the inventory and other screens (there's no Escape key on a phone).
  const close = document.createElement('button');
  close.className = 'touch-btn touch-close hidden';
  close.innerHTML = '&#10005;';
  close.addEventListener('click', (e) => { e.stopPropagation(); closeUI(); });
  close.addEventListener('mousedown', (e) => e.stopPropagation());
  close.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  document.body.appendChild(close);

  // Show the controls only while playing, and keep the crosshair on the aim point.
  const tick = () => {
    const playing = inGame();
    root.classList.toggle('hidden', !playing);
    // The X sits in the corner of whichever screen is open.
    const open = uiOpen() && [...document.querySelectorAll('.inventory-overlay')].find(o => !o.classList.contains('hidden'));
    close.classList.toggle('hidden', !open);
    const frame = open && (open.querySelector('.inventory-frame') || open.querySelector('.inventory-content'));
    if (frame && close.parentElement !== frame) frame.appendChild(close);
    if (playing) {
      const { clientX, clientY } = aimClient();
      crosshair.style.transform = `translate(${clientX}px, ${clientY}px)`;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return root;
}

function svg(name) {
  return `<svg viewBox="0 0 16 16" width="28" height="28" fill="currentColor" shape-rendering="crispEdges">${ICONS[name]}</svg>`;
}
