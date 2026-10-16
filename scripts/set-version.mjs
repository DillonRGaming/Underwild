// npm run set-version 0.5.1 — sets the game's version everywhere it's written
// (package.json and GAME_VERSION in script.js). Then tag v0.5.1 to release it.
import fs from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Usage: npm run set-version 1.2.3');
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = version;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
const script = fs.readFileSync('script.js', 'utf8').replace(/const GAME_VERSION = '[^']*';/, `const GAME_VERSION = '${version}';`);
fs.writeFileSync('script.js', script);
console.log(`Version set to ${version}`);
