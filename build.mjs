// Bundles src/main.ts into dist/Code.js and copies the page and manifest, for `clasp push` (rootDir: dist).
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');

let version = 'dev';
try { version = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch { /* no git */ }
version += '-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

// Top-level functions Apps Script must see by name: web app, google.script.run target, triggers, menu, editor tools.
const ENTRY_POINTS = ['doGet', 'api', 'dailyJob', 'backupJob', 'onOpen', 'menuRefresh', 'menuCloseNow', 'setup'];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
await build({
  entryPoints: [join(root, 'src', 'main.ts')],
  bundle: true,
  format: 'iife',
  globalName: '__HaSlik',
  target: 'es2019',
  charset: 'utf8',
  legalComments: 'none',
  outfile: join(dist, 'Code.js'),
  define: { __VERSION__: JSON.stringify(version) },
  footer: {
    js: '\n' + ENTRY_POINTS.map(n => `function ${n}(e) { return __HaSlik.${n}(e); }`).join('\n') + '\n',
  },
  logLevel: 'warning',
});
copyFileSync(join(root, 'appsscript.json'), join(dist, 'appsscript.json'));
// The page: src/ui/Index.html with src/ui/app.js inlined at the marker (HtmlService serves one file).
const page = readFileSync(join(root, 'src', 'ui', 'Index.html'), 'utf8');
const app = readFileSync(join(root, 'src', 'ui', 'app.js'), 'utf8');
if (!page.includes('<!-- @app.js -->')) throw new Error('src/ui/Index.html is missing the <!-- @app.js --> marker');
writeFileSync(join(dist, 'Index.html'), page.replace('<!-- @app.js -->', () => '<script>\n' + app + '</script>'));
console.log('built dist/ (Code.js, Index.html, appsscript.json)', version);
