// On-screen controls for phones and tablets, driving the same keys and mouse state the
// keyboard and mouse do. Two ways to aim (Options > Controls > Touch Aiming):
//
// Tap (the default): no cursor. The left stick walks and turns your head. Tap the screen
// to place (or use a chest, furnace...); hold it and a magnifier comes up showing the
// block under your finger, then it breaks (drag to move along). Breaking only starts once
// the magnifier is showing, so a tap never breaks anything.
//
// Joystick:
//   - left pad: walk (up/down climb and fly)
//   - right stick: moves the aim around the player (like a mouse: push right and it glides
//     right, faster the further you push) and acts while it's held: it breaks, or places
//     the held block, as set by the small break/place button above it.
//   - with the right stick let go, the left stick points the aim where it's pushed, without acting.
//   - the aim stays put relative to the player, so it travels with you.
//   - tap the world: use what's there (open a chest, light an explosive, place a block)
//   - drag on the world: move the aim without doing anything
//   - jump, down and sprint buttons; "..." for the inventory; chat and pause at the top.

const PAD_DEAD_ZONE = 0.3; // share of the pad's radius before the stick counts as pushed
const AIM_DEAD_ZONE = 0.2; // the aim stick acts once pushed further than this
const AIM_SPEED = 1.8;     // reach-widths per second the aim moves at full push
const AIM_MAX = 1;         // how far (in reaches) the sticks can take the aim
const TAP_MS = 250;        // a touch on the world shorter than this (and barely moved) is a tap
const TAP_MOVE_PX = 12;
const HOLD_MS = 180;       // tap mode: holding this long brings up the magnifier and breaks
const MAGNIFY_TILES = 3;   // blocks across the magnifier

const ICONS = {
  up: '<path d="M8 3 L13 9 H10 V13 H6 V9 H3 Z"/>',
  down: '<path d="M8 13 L13 7 H10 V3 H6 V7 H3 Z"/>',
  sprint: '<path d="M2 3 L7 8 L2 13 Z M8 3 L13 8 L8 13 Z"/>',
  pickaxe: '<path d="M3 3 H11 L14 6 V8 L11 5 H8 L13 13 L11 14 L6 6 L3 6 Z"/>',
  block: '<path d="M3 3 H13 V13 H3 Z M5 5 V11 H11 V5 Z"/>',
  plus: '<path d="M7 3 H9 V7 H13 V9 H9 V13 H7 V9 H3 V7 H7 Z"/>',
  minus: '<path d="M3 7 H13 V9 H3 Z"/>',
  chat: '<path d="M2 3 H14 V11 H7 L4 14 V11 H2 Z"/>',
  pause: '<path d="M4 3 H7 V13 H4 Z M9 3 H12 V13 H9 Z"/>'
};

export function isTouchDevice() {
  // ?touch in the address forces them on (for trying them out on a computer).
  if (typeof location !== 'undefined' && /[?&]touch\b/.test(location.search)) return true;
  return (typeof window !== 'undefined') && (('ontouchstart' in window) || navigator.maxTouchPoints > 0)
    && window.matchMedia?.('(pointer: coarse)').matches;
}

// playerScreen() -> { x, y }: the player's middle in canvas pixels. reach() -> canvas pixels.
export function setupTouchControls({ canvas, input, keybinds, inGame, onInventory, playerScreen, reach, aimMode, tileAt, canReach }) {
  if (!isTouchDevice() || document.getElementById('touchControls')) return null;
  document.body.classList.add('touch-mode');

  const root = document.createElement('div');
  root.id = 'touchControls';
  root.innerHTML = `
    <div class="touch-pad"><div class="touch-pad-stick"></div></div>
    <div class="touch-crosshair"></div>
    <canvas class="touch-magnifier hidden"></canvas>
    <div class="touch-buttons">
      <button class="touch-btn touch-sprint" data-act="sprint">${svg('sprint')}</button>
      <button class="touch-btn touch-jump" data-act="jump">${svg('up')}</button>
      <button class="touch-btn touch-down" data-act="down">${svg('down')}</button>
    </div>
    <div class="touch-pad touch-aim"><div class="touch-pad-stick"></div></div>
    <button class="touch-btn touch-mode-btn" data-act="mode">${svg('pickaxe')}</button>
    <button class="touch-btn touch-more" data-act="inventory">&middot;&middot;&middot;</button>
    <button class="touch-btn touch-zoom-out" data-act="zoom-out">${svg('minus')}</button>
    <button class="touch-btn touch-zoom-in" data-act="zoom-in">${svg('plus')}</button>
    <button class="touch-btn touch-chat" data-act="chat">${svg('chat')}</button>
    <button class="touch-btn touch-pause" data-act="pause">${svg('pause')}</button>`;
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
    // Keep it where it was touched, relative to the player, from now on.
    const p = playerScreen?.();
    if (p && reach()) { offset.x = (aim.x - p.x) / reach(); offset.y = (aim.y - p.y) / reach(); }
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
  const pad = root.querySelector('.touch-pad:not(.touch-aim)');
  const stick = pad.querySelector('.touch-pad-stick');
  let padTouch = null;
  const padVec = { x: 0, y: 0, len: 0 };
  const movePad = (t) => {
    const rect = pad.getBoundingClientRect();
    const r = rect.width / 2;
    let dx = (t.clientX - rect.left - r) / r;
    let dy = (t.clientY - rect.top - r) / r;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    stick.style.transform = `translate(${dx * r * 0.45}px, ${dy * r * 0.45}px)`;
    padVec.x = dx;
    padVec.y = dy;
    padVec.len = Math.min(1, len);
    (dx > PAD_DEAD_ZONE ? keyDown : keyUp)(keybinds.right);
    (dx < -PAD_DEAD_ZONE ? keyDown : keyUp)(keybinds.left);
    // Up on the pad climbs ladders / flies up; down goes down.
    (dy < -0.6 ? keyDown : keyUp)(keybinds.forward);
    (dy > 0.6 ? keyDown : keyUp)(keybinds.backward);
  };
  const releasePad = () => {
    padTouch = null;
    padVec.len = 0;
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

  // --- Aim stick (right) ---
  const aimPad = root.querySelector('.touch-aim');
  const aimStick = aimPad.querySelector('.touch-pad-stick');
  let aimTouch = null;
  const aimVec = { x: 0, y: 0, len: 0 };
  let acting = null; // null | 'break' | 'place'
  let stickMode = 'break';
  const modeBtn = root.querySelector('.touch-mode-btn');
  const stopActing = () => {
    if (acting === 'break') mouse('mouseup', 0);
    if (acting === 'place') mouse('mouseup', 2);
    acting = null;
  };
  // The aim is kept as an offset from the player, in reaches, so it moves with them.
  const offset = { x: 0.6, y: 0 };
  const applyAim = () => {
    const p = playerScreen();
    if (!p) return;
    aim.x = p.x + offset.x * reach();
    aim.y = p.y + offset.y * reach();
    input.mouse.x = aim.x;
    input.mouse.y = aim.y;
  };
  // Glide the offset along a stick's push; it can't go past the reach.
  const steer = (vec, dt) => {
    const k = vec.len * AIM_SPEED * dt / (Math.hypot(vec.x, vec.y) || 1);
    offset.x += vec.x * k;
    offset.y += vec.y * k;
    const len = Math.hypot(offset.x, offset.y);
    if (len > AIM_MAX) { offset.x *= AIM_MAX / len; offset.y *= AIM_MAX / len; }
  };
  const moveAim = (t) => {
    const rect = aimPad.getBoundingClientRect();
    const r = rect.width / 2;
    let dx = (t.clientX - rect.left - r) / r;
    let dy = (t.clientY - rect.top - r) / r;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    aimStick.style.transform = `translate(${dx * r * 0.45}px, ${dy * r * 0.45}px)`;
    aimVec.len = Math.min(1, len);
    aimVec.x = dx;
    aimVec.y = dy;
    if (aimVec.len < AIM_DEAD_ZONE) return;
    if (!acting) {
      acting = stickMode;
      mouse('mousedown', acting === 'break' ? 0 : 2);
    }
  };
  const releaseAim = () => {
    aimTouch = null;
    aimStick.style.transform = '';
    aimVec.len = 0;
    stopActing();
  };
  aimPad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    aimTouch = t.identifier;
    moveAim(t);
  }, { passive: false });
  aimPad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === aimTouch) moveAim(t);
  }, { passive: false });
  aimPad.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === aimTouch) releaseAim(); });
  aimPad.addEventListener('touchcancel', releaseAim);

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
      else if (act === 'inventory') onInventory();
      else if (act === 'mode') {
        stickMode = stickMode === 'break' ? 'place' : 'break';
        modeBtn.innerHTML = svg(stickMode === 'break' ? 'pickaxe' : 'block');
        modeBtn.classList.toggle('on', stickMode === 'place');
        if (acting) { stopActing(); if (aimVec.len >= AIM_DEAD_ZONE) { acting = stickMode; mouse('mousedown', acting === 'break' ? 0 : 2); } }
      }
      else if (act === 'zoom-in') window.changeZoom?.(1);
      else if (act === 'zoom-out') window.changeZoom?.(-1);
      else if (act === 'chat') window.dispatchEvent(new KeyboardEvent('keydown', { code: keybinds.chat, key: 't', bubbles: true }));
      else if (act === 'pause') window.dispatchEvent(new KeyboardEvent('keydown', { code: keybinds.pause, key: 'Escape', bubbles: true }));
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
    };
    btn.addEventListener('touchend', up, { passive: false });
    btn.addEventListener('touchcancel', up, { passive: false });
  }

  // --- Aiming: touch (and drag on) the world ---
  let worldTouch = null;
  const tapMode = () => aimMode() === 'tap';
  const magnifier = root.querySelector('.touch-magnifier');
  let holdTimer = null;
  let breaking = false;
  const finger = { x: 0, y: 0 }; // client pixels
  const stopBreaking = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    if (breaking) mouse('mouseup', 0);
    breaking = false;
    magnifier.classList.add('hidden');
  };

  canvas.addEventListener('touchstart', (e) => {
    // Tapping the world while the chat is open closes it.
    if (!document.getElementById('chat')?.classList.contains('hidden')) {
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      return;
    }
    if (!inGame()) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    if (worldTouch) return; // one finger on the world at a time
    worldTouch = { id: t.identifier, x: t.clientX, y: t.clientY, start: performance.now() };
    finger.x = t.clientX;
    finger.y = t.clientY;
    setAim(t.clientX, t.clientY);
    if (tapMode()) {
      // Held long enough: show the magnifier, then start breaking under the finger.
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (!worldTouch || !inGame()) return;
        magnifier.classList.remove('hidden');
        setAim(finger.x, finger.y);
        breaking = true;
        mouse('mousedown', 0);
      }, HOLD_MS);
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!inGame()) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (worldTouch?.id !== t.identifier) continue;
      if (Math.hypot(t.clientX - worldTouch.x, t.clientY - worldTouch.y) > TAP_MOVE_PX) worldTouch.moved = true;
      finger.x = t.clientX;
      finger.y = t.clientY;
      setAim(t.clientX, t.clientY);
    }
  }, { passive: false });
  // A quick tap uses what's there, like a right click (in tap mode that's placing too).
  const endWorldTouch = (e) => {
    for (const t of e.changedTouches) {
      if (worldTouch?.id !== t.identifier) continue;
      const tap = !worldTouch.moved && performance.now() - worldTouch.start < TAP_MS;
      worldTouch = null;
      const wasBreaking = breaking;
      stopBreaking();
      if (tap && !wasBreaking && inGame()) {
        mouse('mousedown', 2);
        mouse('mouseup', 2);
      }
    }
  };
  canvas.addEventListener('touchend', endWorldTouch);
  canvas.addEventListener('touchcancel', endWorldTouch);

  // The magnifier: the 3x3 blocks around the finger, drawn from the game's own frame, with
  // a grid and the targeted block outlined. It sits above the finger so it isn't covered.
  const drawMagnifier = () => {
    const rect = canvas.getBoundingClientRect();
    const sx = (finger.x - rect.left) * (canvas.width / rect.width);
    const sy = (finger.y - rect.top) * (canvas.height / rect.height);
    const tile = tileAt(sx, sy);
    const cssSize = magnifier.getBoundingClientRect().width || 180;
    const px = Math.round(cssSize * (window.devicePixelRatio || 1));
    if (magnifier.width !== px) { magnifier.width = px; magnifier.height = px; }
    const ctx = magnifier.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // Centred on the finger itself (not snapped to a block), with the block grid and the
    // targeted block drawn wherever they fall.
    const src = MAGNIFY_TILES * tile.size;
    const srcLeft = sx - src / 2;
    const srcTop = sy - src / 2;
    const scale = px / src;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, px, px);
    ctx.drawImage(canvas, srcLeft, srcTop, src, src, 0, 0, px, px);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = -2; k <= MAGNIFY_TILES + 1; k++) {
      const gx = Math.round((tile.x + k * tile.size - srcLeft) * scale) + 0.5;
      const gy = Math.round((tile.y + k * tile.size - srcTop) * scale) + 0.5;
      if (gx > 0 && gx < px) { ctx.moveTo(gx, 0); ctx.lineTo(gx, px); }
      if (gy > 0 && gy < px) { ctx.moveTo(0, gy); ctx.lineTo(px, gy); }
    }
    ctx.stroke();
    // Red when the block is too far away to reach.
    ctx.strokeStyle = canReach(tile.tx, tile.ty) ? '#fff' : '#ff4040';
    ctx.lineWidth = Math.max(2, tile.size * scale / 14);
    ctx.strokeRect((tile.x - srcLeft) * scale, (tile.y - srcTop) * scale, tile.size * scale, tile.size * scale);
    // Always above the finger, kept on screen.
    const gap = 28;
    let left = finger.x - cssSize / 2;
    let top = finger.y - cssSize - gap;
    left = Math.max(8, Math.min(window.innerWidth - cssSize - 8, left));
    top = Math.max(8, Math.min(window.innerHeight - cssSize - 8, top));
    magnifier.style.transform = `translate(${left}px, ${top}px)`;
  };

  // Tap a hotbar slot to select it.
  document.getElementById('hotbar')?.addEventListener('touchstart', (e) => {
    const slot = e.target.closest?.('.hotbar-slot');
    if (!slot) return;
    e.preventDefault();
    const n = Number(slot.dataset.index) + 1;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: `Digit${n}`, key: String(n), bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: `Digit${n}`, key: String(n), bubbles: true }));
  }, { passive: false });

  // The send button next to the chat box (touching it doesn't close the keyboard first).
  document.getElementById('chatSend')?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }));
  }, { passive: false });

  // Closing the phone keyboard (tapping away from the chat box) closes the chat too. Not at
  // once: pressing the keyboard's send key blurs the box just before its Enter arrives.
  document.getElementById('chatInput')?.addEventListener('blur', () => {
    setTimeout(() => {
      const chatInput = document.getElementById('chatInput');
      if (document.activeElement === chatInput) return;
      if (!document.getElementById('chat')?.classList.contains('hidden')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      }
    }, 300);
  });

  // Show the controls only while playing, and keep the crosshair on the aim point.
  let lastTick = 0;
  const tick = () => {
    const playing = inGame();
    root.classList.toggle('hidden', !playing);
    const tap = tapMode();
    root.classList.toggle('tap-mode', tap);
    document.body.classList.toggle('touch-tap-mode', tap);
    if (!playing && acting) releaseAim();
    if (!playing && breaking) stopBreaking();
    if (breaking) drawMagnifier();
    const now = performance.now();
    const dt = Math.min(0.05, (now - (lastTick || now)) / 1000);
    lastTick = now;
    if (playing) {
      if (aimTouch !== null && aimVec.len >= AIM_DEAD_ZONE) steer(aimVec, dt);
      // The left stick points the aim straight where it's pushed (not gliding).
      else if (aimTouch === null && padVec.len >= PAD_DEAD_ZONE) { offset.x = padVec.x * AIM_MAX; offset.y = padVec.y * AIM_MAX; }
      if (!worldTouch) applyAim();
    }
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
