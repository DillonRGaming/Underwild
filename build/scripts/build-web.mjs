// Copies the game's web files into www/ for the Android app (Capacitor packs that folder).
// Leaves out the desktop app's own files, build output and personal data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'build', 'www');
const SKIP = new Set([
  'node_modules', 'build', 'data', '.git', '.github', '.claude', 'platforms',
  'package.json', 'package-lock.json', 'caveman.md', 'rules.txt'
]);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const name of fs.readdirSync(root)) {
  if (SKIP.has(name) || name.startsWith('.') || name.endsWith('.txt') || name.endsWith('.log')) continue;
  fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });
}
console.log('Web files copied to build/www/');
