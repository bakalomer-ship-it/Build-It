// Bundles the game into one self-contained HTML file (dist/single.html),
// used for the claude.ai preview link. Needs esbuild: npm install, then
// npm run build:single
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({
  entryPoints: [join(root, 'src/main.js')],
  bundle: true, format: 'iife', minify: true, write: false, target: 'es2020',
  alias: {
    three: join(root, 'lib/three.module.min.js'),
    'three/addons/controls/OrbitControls.js': join(root, 'lib/OrbitControls.js'),
  },
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(root, 'style.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<!--GAME-BODY-START-->'), html.indexOf('<!--GAME-BODY-END-->'));
const page = `<title>בונים מחנאות</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;800&display=swap">
<style>${css}</style>
<div dir="rtl" lang="he">${body}</div>
<script>${js}</script>
`;
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/single.html'), page);
console.log('dist/single.html', (page.length / 1024).toFixed(0) + ' KB');
