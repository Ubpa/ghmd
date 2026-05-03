#!/usr/bin/env node
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Marked } from 'marked';
import markedAlert from 'marked-alert';
import markedFootnote from 'marked-footnote';
import hljs from 'highlight.js';

const __dir = path.dirname(new URL(import.meta.url).pathname);

// ── --init: download katex + mermaid for offline use ──
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

// ── Markdown pipeline ──
const marked = new Marked();
marked.use(markedAlert());
marked.use(markedFootnote());
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
      if (lang && hljs.getLanguage(lang)) {
        return `<pre><code class="hljs language-${lang}">${hljs.highlight(text, { language: lang }).value}</code></pre>`;
      }
      return `<pre><code>${escHtml(text)}</code></pre>`;
    }
  }
});

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── CSS (always local — installed as core deps) ──
const cssDir = path.dirname(new URL(import.meta.resolve('github-markdown-css')).pathname);
const ghLightCss = fs.readFileSync(path.join(cssDir, 'github-markdown-light.css'), 'utf8');
const ghDarkCss  = fs.readFileSync(path.join(cssDir, 'github-markdown-dark.css'), 'utf8');

const hljsDir = path.join(path.dirname(new URL(import.meta.resolve('highlight.js')).pathname), '..', 'styles');
const hljsLightCss = fs.readFileSync(path.join(hljsDir, 'github.css'), 'utf8');
const hljsDarkCss  = fs.readFileSync(path.join(hljsDir, 'github-dark.css'), 'utf8');

// ── KaTeX + Mermaid: local if available, CDN fallback ──
function tryRead(...segments) {
  try { return fs.readFileSync(path.join(__dir, 'node_modules', ...segments), 'utf8'); }
  catch { return null; }
}

const katexCss = tryRead('katex', 'dist', 'katex.min.css');
const katexJs  = tryRead('katex', 'dist', 'katex.min.js');
const katexAutoRenderJs = tryRead('katex', 'dist', 'contrib', 'auto-render.min.js');
const mermaidJs = tryRead('mermaid', 'dist', 'mermaid.min.js');

const offline = !!(katexCss && katexJs && katexAutoRenderJs && mermaidJs);
const katexFontsDir = offline ? path.join(__dir, 'node_modules', 'katex', 'dist', 'fonts') : null;

function katexBlock() {
  if (offline) {
    return `<style>${katexCss.replace(/url\(fonts\//g, 'url(/__fonts/')}</style>
<script>${katexJs}</script>
<script>${katexAutoRenderJs}</script>`;
  }
  return `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js"></script>`;
}

function mermaidBlock() {
  if (offline) return `<script>${mermaidJs}</script>`;
  return `<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>`;
}

// ── Render ──
let lastMtime = 0;
let cachedBody = '';

function render() {
  const mtime = fs.statSync(absFile).mtimeMs;
  if (mtime === lastMtime) return;
  lastMtime = mtime;
  cachedBody = marked.parse(fs.readFileSync(absFile, 'utf8'));
  console.log(`[${new Date().toLocaleTimeString()}] rendered ${path.basename(absFile)}`);
}

function html(body) {
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
  html, body { margin: 0; padding: 0; }
  html[data-theme="light"] { background: #fff; color-scheme: light; }
  html[data-theme="dark"]  { background: #0d1117; color-scheme: dark; }

  .ghmd-wrapper {
    box-sizing: border-box;
    width: 100%;
    max-width: 980px;
    margin: 0 auto;
    padding: 45px;
  }
  @media (max-width: 767px) { .ghmd-wrapper { padding: 15px; } }

  .theme-toggle {
    position: fixed; top: 16px; right: 16px; z-index: 999;
    width: 40px; height: 40px;
    border: 1px solid #d0d7de; border-radius: 8px;
    background: #f6f8fa; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; line-height: 1;
    transition: background 0.2s, border-color 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  html[data-theme="dark"] .theme-toggle { background: #21262d; border-color: #30363d; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
  .theme-toggle:hover { opacity: 0.8; }
  .theme-toggle .icon-sun, .theme-toggle .icon-moon { display: none; }
  html[data-theme="light"] .theme-toggle .icon-moon { display: block; }
  html[data-theme="dark"]  .theme-toggle .icon-sun  { display: block; }

  /* Alerts */
  .markdown-alert { padding: 8px 16px; margin-bottom: 16px; border-left: 4px solid; border-radius: 6px; }
  .markdown-alert > :first-child { margin-top: 0; }
  .markdown-alert > :last-child  { margin-bottom: 0; }
  .markdown-alert-title { display: flex; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 4px; }
  .markdown-alert-title svg { fill: currentColor; }

  html[data-theme="light"] .markdown-alert-note  { border-color: #1f6feb; }
  html[data-theme="light"] .markdown-alert-note .markdown-alert-title { color: #1f6feb; }
  html[data-theme="light"] .markdown-alert-tip   { border-color: #238636; }
  html[data-theme="light"] .markdown-alert-tip .markdown-alert-title  { color: #238636; }
  html[data-theme="light"] .markdown-alert-important { border-color: #8957e5; }
  html[data-theme="light"] .markdown-alert-important .markdown-alert-title { color: #8957e5; }
  html[data-theme="light"] .markdown-alert-warning { border-color: #d29922; }
  html[data-theme="light"] .markdown-alert-warning .markdown-alert-title { color: #d29922; }
  html[data-theme="light"] .markdown-alert-caution { border-color: #da3633; }
  html[data-theme="light"] .markdown-alert-caution .markdown-alert-title { color: #da3633; }

  html[data-theme="dark"] .markdown-alert-note  { border-color: #58a6ff; }
  html[data-theme="dark"] .markdown-alert-note .markdown-alert-title { color: #58a6ff; }
  html[data-theme="dark"] .markdown-alert-tip   { border-color: #3fb950; }
  html[data-theme="dark"] .markdown-alert-tip .markdown-alert-title  { color: #3fb950; }
  html[data-theme="dark"] .markdown-alert-important { border-color: #bc8cff; }
  html[data-theme="dark"] .markdown-alert-important .markdown-alert-title { color: #bc8cff; }
  html[data-theme="dark"] .markdown-alert-warning { border-color: #d29922; }
  html[data-theme="dark"] .markdown-alert-warning .markdown-alert-title { color: #d29922; }
  html[data-theme="dark"] .markdown-alert-caution { border-color: #f85149; }
  html[data-theme="dark"] .markdown-alert-caution .markdown-alert-title { color: #f85149; }

  /* Diff */
  .diff-add, .diff-del { display: inline-block; width: 100%; }
  html[data-theme="light"] .diff-add { color: #1a7f37; background: #dafbe1; }
  html[data-theme="light"] .diff-del { color: #cf222e; background: #ffebe9; }
  html[data-theme="dark"]  .diff-add { color: #3fb950; background: rgba(46,160,67,0.15); }
  html[data-theme="dark"]  .diff-del { color: #f85149; background: rgba(248,81,73,0.10); }

  .contains-task-list { list-style: none; padding-left: 0; }
  .task-list-item { position: relative; padding-left: 24px; }
  .task-list-item input[type="checkbox"] { position: absolute; left: 0; top: 4px; }

  .footnotes { font-size: 0.875em; margin-top: 32px; padding-top: 16px; }
  html[data-theme="light"] .footnotes { border-top: 1px solid #d0d7de; }
  html[data-theme="dark"]  .footnotes { border-top: 1px solid #30363d; }

  kbd { display: inline-block; padding: 3px 5px; font: 11px ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace; line-height: 10px; vertical-align: middle; border-radius: 6px; }
  html[data-theme="light"] kbd { color: #1f2328; background: #f6f8fa; border: 1px solid #d0d7de; box-shadow: inset 0 -1px 0 #d0d7de; }
  html[data-theme="dark"]  kbd { color: #c9d1d9; background: #161b22; border: 1px solid #30363d; box-shadow: inset 0 -1px 0 #21262d; }

  .math-block { text-align: center; margin: 16px 0; overflow-x: auto; }
  pre.mermaid { background: transparent; border: none; text-align: center; }
</style>
${katexBlock()}
${mermaidBlock()}
<script>
  const saved = localStorage.getItem('ghmd-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
</script>
</head>
<body>
<button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">
  <span class="icon-sun">☀️</span>
  <span class="icon-moon">🌙</span>
</button>
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
    applyTheme(next);
    document.querySelectorAll('.mermaid[data-processed],.mermaid svg').forEach(el => {
      const pre = el.closest('pre') || el;
      if (pre._originalText) { pre.removeAttribute('data-processed'); pre.innerHTML = pre._originalText; }
    });
    mermaid.initialize({ startOnLoad: false, theme: next === 'dark' ? 'dark' : 'default' });
    mermaid.run();
  }

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

const FONT_TYPES = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

const server = http.createServer((req, res) => {
  if (req.url === '/__poll') {
    render();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(String(lastMtime));
    return;
  }
  if (offline && req.url.startsWith('/__fonts/')) {
    const fontPath = path.join(katexFontsDir, path.basename(req.url));
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
  if (!offline) console.log(`\n  Tip: run "node ${path.basename(import.meta.url)} --init" for fully offline use`);
  console.log();
});
