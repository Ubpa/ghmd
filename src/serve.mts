#!/usr/bin/env node
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Marked } from 'marked';
import markedAlert from 'marked-alert';
import markedFootnote from 'marked-footnote';
import { createFrontmatterExtension } from './frontmatter.js';
import { createMathExtensions } from './math.js';
import { sourceLines, applySourceLineWrappers } from './source-lines.js';
import { createHeadingRenderer } from './heading.js';
import { markedHighlight } from 'marked-highlight';
import { markedEmoji } from 'marked-emoji';
import markedLinkifyIt from 'marked-linkify-it';
import hljs from 'highlight.js';
import { gemoji } from 'gemoji';

const emojiMap: Record<string, string> = {};
gemoji.forEach(e => e.names.forEach(n => { emojiMap[n] = e.emoji; }));

const __dir = path.resolve(import.meta.dirname, '..');

if (process.argv[2] === '--init') {
  console.log('Installing katex and mermaid for offline use...');
  execSync('npm install katex mermaid', { cwd: __dir, stdio: 'inherit' });
  console.log('\nDone. ghmd will now work fully offline.');
  process.exit(0);
}

const file = process.argv[2];
if (!file) {
  console.error('Usage:');
  console.error('  ghmd <file.md> [port]    Serve markdown preview');
  console.error('  ghmd --init              Download KaTeX + Mermaid for offline use');
  process.exit(1);
}
const port = parseInt(process.argv[3] || '6419');
const absFile = path.resolve(file);

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const marked = new Marked();
marked.use({ extensions: [createFrontmatterExtension(), ...createMathExtensions()] });
marked.use(markedAlert());
marked.use(markedFootnote());
marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
    return code;
  }
}));
marked.use(markedEmoji({ emojis: emojiMap }));
marked.use(markedLinkifyIt());
marked.use(createHeadingRenderer());
marked.use({
  renderer: {
    code({ text, lang }) {
      if (lang === 'mermaid') return `<pre class="mermaid">${escHtml(text)}</pre>`;
      if (lang === 'math') return `<div class="math-block">$$${escHtml(text)}$$</div>`;
      if (lang === 'diff') {
        const lines = text.split('\n').map(line => {
          if (line.startsWith('+')) return `<span class="diff-add">${escHtml(line)}</span>`;
          if (line.startsWith('-')) return `<span class="diff-del">${escHtml(line)}</span>`;
          return `<span>${escHtml(line)}</span>`;
        }).join('\n');
        return `<pre><code class="language-diff">${lines}</code></pre>`;
      }
      return false;
    }
  }
});

const uiCss  = fs.readFileSync(path.join(__dir, 'src', 'ui.css'), 'utf8');
const tocJs  = fs.readFileSync(path.join(__dir, 'src', 'toc.js'), 'utf8');
const scrollSyncJs = fs.readFileSync(path.join(__dir, 'src', 'scroll-sync.js'), 'utf8');
const svgSliderJs = fs.readFileSync(path.join(__dir, 'src', 'svg-slider.js'), 'utf8');

const cssDir = path.dirname(new URL(import.meta.resolve('github-markdown-css')).pathname);
const ghLightCss = fs.readFileSync(path.join(cssDir, 'github-markdown-light.css'), 'utf8');
const ghDarkCss  = fs.readFileSync(path.join(cssDir, 'github-markdown-dark.css'), 'utf8');

const hljsDir = path.join(path.dirname(new URL(import.meta.resolve('highlight.js')).pathname), '..', 'styles');
const hljsLightCss = fs.readFileSync(path.join(hljsDir, 'github.css'), 'utf8');
const hljsDarkCss  = fs.readFileSync(path.join(hljsDir, 'github-dark.css'), 'utf8');

function tryRead(...segments: string[]): string | null {
  try { return fs.readFileSync(path.join(__dir, 'node_modules', ...segments), 'utf8'); }
  catch { return null; }
}

const katexCss = tryRead('katex', 'dist', 'katex.min.css');
const katexJs  = tryRead('katex', 'dist', 'katex.min.js');
const katexAutoRenderJs = tryRead('katex', 'dist', 'contrib', 'auto-render.min.js');
const mermaidJs = tryRead('mermaid', 'dist', 'mermaid.min.js');

const offline = !!(katexCss && katexJs && katexAutoRenderJs && mermaidJs);
const katexFontsDir = offline ? path.join(__dir, 'node_modules', 'katex', 'dist', 'fonts') : null;

function katexBlock(): string {
  if (offline) {
    return `<style>${katexCss!.replace(/url\(fonts\//g, 'url(/__fonts/')}</style>
<script>${katexJs}</script>
<script>${katexAutoRenderJs}</script>`;
  }
  return `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js"></script>`;
}

function mermaidBlock(): string {
  if (offline) return `<script>${mermaidJs}</script>`;
  return `<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>`;
}

let lastMtime = 0;
let cachedBody = '';

applySourceLineWrappers(marked);

function render(): void {
  const mtime = fs.statSync(absFile).mtimeMs;
  if (mtime === lastMtime) return;
  lastMtime = mtime;
  const md = fs.readFileSync(absFile, 'utf8');
  marked.use({ extensions: [createFrontmatterExtension()] });
  marked.use(sourceLines(md));
  cachedBody = marked.parse(md) as string;
  console.log(`[${new Date().toLocaleTimeString()}] rendered ${path.basename(absFile)}`);
}

function html(body: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${path.basename(absFile)} — ghmd</title>
<style id="gh-light">${ghLightCss}</style>
<style id="gh-dark" disabled>${ghDarkCss}</style>
<style id="hljs-light">${hljsLightCss}</style>
<style id="hljs-dark" disabled>${hljsDarkCss}</style>
<style>
  html[data-theme="light"] { background: #fff; color-scheme: light; }
  html[data-theme="dark"]  { background: #0d1117; color-scheme: dark; }
  .ghmd-wrapper { padding: 45px; }
  @media (max-width: 767px) { .ghmd-wrapper { padding: 15px; } }
</style>
<style>${uiCss}</style>
${katexBlock()}
${mermaidBlock()}
<script>
  const saved = localStorage.getItem('ghmd-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
</script>
</head>
<body>
<div class="toolbar">
  <button class="toc-toggle" id="tocBtn" onclick="toggleToc()" title="Table of contents">☰</button>
  <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">
    <span class="icon-sun">☀️</span>
    <span class="icon-moon">🌙</span>
  </button>
</div>
<nav class="toc-panel" id="tocPanel"></nav>
<div class="ghmd-wrapper markdown-body">
${body}
</div>
<script>
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('gh-light').disabled = (theme !== 'light');
    document.getElementById('gh-dark').disabled  = (theme !== 'dark');
    document.getElementById('hljs-light').disabled = (theme !== 'light');
    document.getElementById('hljs-dark').disabled  = (theme !== 'dark');
    document.querySelectorAll('picture source[media*="prefers-color-scheme"]').forEach(src => {
      const orig = src.getAttribute('data-media') || src.getAttribute('media');
      if (!src.getAttribute('data-media')) src.setAttribute('data-media', orig);
      const wantsDark = orig.includes('dark');
      src.setAttribute('media', (wantsDark === (theme === 'dark')) ? 'all' : 'not all');
    });
  }

  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    localStorage.setItem('ghmd-theme', next);
    document.querySelectorAll('.mermaid[data-processed],.mermaid svg').forEach(el => {
      const pre = el.closest('pre') || el;
      if (pre._originalText) { pre.removeAttribute('data-processed'); pre.innerHTML = pre._originalText; }
    });
    mermaid.initialize({ startOnLoad: false, theme: next === 'dark' ? 'dark' : 'default' });
    applyTheme(next);
    mermaid.run();
  }

  ${tocJs}

  applyTheme(document.documentElement.getAttribute('data-theme'));
  document.querySelectorAll('pre.mermaid').forEach(el => { el._originalText = el.textContent; });

  renderMathInElement(document.querySelector('.ghmd-wrapper'), {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
    ],
    throwOnError: false,
  });

  const initTheme = document.documentElement.getAttribute('data-theme');
  mermaid.initialize({ startOnLoad: true, theme: initTheme === 'dark' ? 'dark' : 'default' });
  buildToc();

  // Mermaid SVG sliders
  ${svgSliderJs}
  setTimeout(() => addSvgSliders(), 500);
  new MutationObserver(() => addSvgSliders()).observe(document.querySelector('.ghmd-wrapper'), { childList: true, subtree: true });

  let mtime = '';
  setInterval(async () => {
    try {
      const r = await fetch('/__poll');
      const t = await r.text();
      if (mtime && t !== mtime) location.reload();
      mtime = t;
    } catch {}
  }, 1000);
</script>
</body>
</html>`;
}

render();

const FONT_TYPES: Record<string, string> = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

const server = http.createServer((req, res) => {
  if (req.url === '/__poll') {
    render();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(String(lastMtime));
    return;
  }
  if (offline && req.url?.startsWith('/__fonts/')) {
    const fontPath = path.join(katexFontsDir!, path.basename(req.url));
    const ext = path.extname(req.url);
    try {
      res.writeHead(200, { 'Content-Type': FONT_TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000' });
      res.end(fs.readFileSync(fontPath));
    } catch { res.writeHead(404); res.end(); }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html(cachedBody));
});

server.listen(port, () => {
  console.log(`\n  ghmd — local GitHub-style Markdown viewer`);
  console.log(`  Mode:  ${offline ? 'offline (local assets)' : 'online (CDN for KaTeX + Mermaid)'}`);
  console.log(`  File:  ${absFile}`);
  console.log(`  URL:   http://localhost:${port}`);
  if (!offline) console.log(`\n  Tip: run "ghmd --init" for fully offline use`);
  console.log();
});
