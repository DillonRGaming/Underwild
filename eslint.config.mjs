// ESLint (npm run lint). The game code runs in the browser as ES modules; the desktop app
// and build scripts run in Node.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'build/www/**', 'build/dist/**', 'build/release/**', 'platforms/android/**', 'src/lib/**', 'data/**']
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'assets/**/*.js', 'mods/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser }
    }
  },
  {
    files: ['src/logic/chunkWorker.js'],
    languageOptions: { globals: { ...globals.worker } }
  },
  {
    files: ['platforms/desktop/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['build/scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } }
  },
  {
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-case-declarations': 'off',
      'no-constant-condition': ['warn', { checkLoops: false }],
      'prefer-const': ['warn', { destructuring: 'all' }],
      eqeqeq: ['warn', 'smart']
    }
  }
];
