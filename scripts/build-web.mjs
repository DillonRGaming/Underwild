// Copies the game's web files into www/ for the Android app (Capacitor packs that folder).
// Leaves out the desktop app's own files, build output and personal data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www');
const SKIP = new Set([
  'node_modules', 'android', 'www', 'release', 'dist', 'worlds', 'concepts', 'crash-dumps',
  'scripts', '.git', '.github', '.claude', 'main.js', 'preload.js', 'mpMain.js',
  'package.json', 'package-lock.json', 'capacitor.config.json', 'preferences.json',
  'diag.html', 'caveman.md', 'rules.txt', 'tree_variants.png', 'underwild-screen.png'
]);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const name of fs.readdirSync(root)) {
  if (SKIP.has(name) || name.startsWith('.') || name.endsWith('.txt') || name.endsWith('.log')) continue;
  fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });
}
console.log('Web files copied to www/');
