#!/usr/bin/env node
// Copies only the needed dist files from node_modules into vendor/
// Run: node scripts/vendor.mjs

import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const nm = (...p) => path.join(root, 'node_modules', ...p);
const vd = (...p) => path.join(root, 'vendor', ...p);

function cp(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

// CSS
cp(nm('github-markdown-css', 'github-markdown-light.css'), vd('css', 'github-markdown-light.css'));
cp(nm('github-markdown-css', 'github-markdown-dark.css'),  vd('css', 'github-markdown-dark.css'));
cp(nm('highlight.js', 'styles', 'github.css'),             vd('css', 'hljs-light.css'));
cp(nm('highlight.js', 'styles', 'github-dark.css'),        vd('css', 'hljs-dark.css'));

// KaTeX
cp(nm('katex', 'dist', 'katex.min.js'),                    vd('katex', 'katex.min.js'));
cp(nm('katex', 'dist', 'katex.min.css'),                   vd('katex', 'katex.min.css'));
cp(nm('katex', 'dist', 'contrib', 'auto-render.min.js'),   vd('katex', 'auto-render.min.js'));

// KaTeX fonts (woff2 only — smallest, all modern browsers support it)
const fontsDir = nm('katex', 'dist', 'fonts');
fs.mkdirSync(vd('katex', 'fonts'), { recursive: true });
for (const f of fs.readdirSync(fontsDir)) {
  if (f.endsWith('.woff2')) cp(path.join(fontsDir, f), vd('katex', 'fonts', f));
}

// Mermaid
cp(nm('mermaid', 'dist', 'mermaid.min.js'), vd('mermaid.min.js'));

console.log('vendor/ updated');
