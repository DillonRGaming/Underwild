// /camera pic and /camera record: save what the game canvas shows (with the camera's filter)
// as a PNG, or record it as a WebM video.
import { FILTERS } from '../core/camera.js';

function stamp() {
  // Local time, so the file name matches the clock.
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function download(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// The picture as shown: the canvas with the filter baked in. In the desktop app it goes in the
// screenshots folder (beside the worlds); in a browser it's downloaded.
// Resolves to { name, url, file } (file: where it was saved, desktop only).
export async function takePicture(canvas, filter = '') {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.filter = FILTERS[filter] || 'none';
  ctx.drawImage(canvas, 0, 0);
  const name = `underwild-${stamp()}.png`;
  const url = out.toDataURL('image/png');
  const api = window.electronAPI?.screenshots;
  if (api) return { name, url, file: await api.save(name, url) };
  download(url, name);
  return { name, url, file: null };
}

// Opens the screenshots folder (desktop app), with `file` picked if given.
export function openScreenshots(file) {
  return window.electronAPI?.screenshots?.open(file) ?? null;
}

export function canOpenScreenshots() {
  return !!window.electronAPI?.screenshots;
}

let recorder = null;

export function isRecording() {
  return !!recorder;
}

export function startRecording(canvas) {
  if (recorder || !canvas.captureStream || typeof MediaRecorder === 'undefined') return false;
  const chunks = [];
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const r = new MediaRecorder(canvas.captureStream(60), type ? { mimeType: type, videoBitsPerSecond: 8_000_000 } : undefined);
  r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  r.onstop = () => {
    const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    download(url, `underwild-${stamp()}.webm`);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  r.start(1000);
  recorder = r;
  return true;
}

export function stopRecording() {
  if (!recorder) return false;
  recorder.stop();
  recorder = null;
  return true;
}
