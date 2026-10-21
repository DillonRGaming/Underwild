// The chat log (top left) and the short notes shown in the corner.

// Messages (a player's chat, someone joining...) go in the chat log, top left. System lines
// have no name. Each line fades a few seconds after it appears; opening the chat shows them all.
const CHAT_LINES_KEPT = 100;

const CHAT_FADE_MS = 8000;

// A line fades out `delay` ms from now, then folds away so the ones below slide up.
function scheduleChatFade(line, delay) {
  line.fadeTimers?.forEach(clearTimeout);
  line.classList.remove('fading', 'faded', 'gone');
  line.style.maxHeight = '';
  line.fadeTimers = [
    setTimeout(() => {
      // Fading and folding start together: the lines below begin sliding up straight away.
      line.classList.add('fading');
      line.style.maxHeight = `${line.offsetHeight}px`;
      void line.offsetHeight;
      line.style.maxHeight = '0px';
      line.classList.add('faded');
    }, delay),
    setTimeout(() => line.classList.add('gone'), delay + 700)
  ];
}

// When the chat closes, the older lines it was showing don't all vanish at once: the ones that
// fit in the log fade away one after another, oldest first.
export function collapseChatHistory() {
  const log = document.getElementById('chatLog');
  if (!log) return;
  const lines = Array.from(log.children).slice(-8);
  lines.forEach((line, i) => {
    if (line.classList.contains('faded') || line.classList.contains('fading')) scheduleChatFade(line, 1500 + i * 450);
  });
}

export function addChatLine(text, name = null, kind = '', color = null) {
  const log = document.getElementById('chatLog');
  if (!log) return;
  const line = document.createElement('div');
  line.className = kind ? `chat-line ${kind}` : 'chat-line';
  const body = document.createElement('span');
  body.className = 'chat-text';
  if (color) body.style.color = color;
  if (name) {
    const tag = document.createElement('span');
    tag.className = 'chat-name';
    tag.textContent = `<${name}> `;
    if (color) tag.style.color = color;
    body.appendChild(tag);
  }
  body.appendChild(document.createTextNode(text));
  const time = document.createElement('span');
  time.className = 'chat-time';
  const now = new Date();
  time.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  line.append(body, time);
  // Keep following the newest line, unless you've scrolled up in the open chat to read back.
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 8;
  log.appendChild(line);
  while (log.childElementCount > CHAT_LINES_KEPT) log.firstChild.remove();
  if (atBottom || !document.getElementById('chatArea')?.classList.contains('chat-open')) log.scrollTop = log.scrollHeight;
  scheduleChatFade(line, CHAT_FADE_MS);
  return line;
}

// A line with a picture under it (screenshots); clicking the picture runs onClick.
export function addChatImage(text, src, onClick) {
  const line = addChatLine(text);
  if (!line) return;
  const img = document.createElement('img');
  img.className = 'chat-image';
  img.src = src;
  img.alt = text;
  img.draggable = false;
  if (onClick) img.addEventListener('click', onClick);
  img.addEventListener('load', () => {
    const log = document.getElementById('chatLog');
    if (log) log.scrollTop = log.scrollHeight;
  });
  line.querySelector('.chat-text')?.appendChild(img);
}

export function showToast(text) {
  addChatLine(text);
}

// The zoom level isn't a chat message: it flashes in the old corner spot. A new note replaces
// the one showing (zooming several steps shows just the latest level, not a pile of them).
let hudNote = null;
let hudNoteTimers = [];
export function showHudNote(text) {
  const el = document.getElementById('mpToast');
  if (!el) return;
  hudNoteTimers.forEach(clearTimeout);
  if (!hudNote || !hudNote.isConnected) {
    hudNote = document.createElement('div');
    hudNote.className = 'mp-toast-line';
    el.appendChild(hudNote);
  }
  const line = hudNote;
  line.classList.remove('fading');
  line.textContent = text;
  hudNoteTimers = [
    setTimeout(() => line.classList.add('fading'), 2000),
    setTimeout(() => {
      line.remove();
      if (hudNote === line) hudNote = null;
    }, 2600)
  ];
}
