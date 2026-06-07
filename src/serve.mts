import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createMarked } from './render.js';
import type { AddressInfo } from 'net';

const __dir = path.resolve(import.meta.dirname, '..');

// ---------- arg parsing ----------

interface Args {
  mode: 'init' | 'file' | 'root' | 'help';
  file?: string;
  port: number;
  rootDir?: string;
}

function parseArgs(argv: string[]): Args {
  if (argv[0] === '--init') return { mode: 'init', port: 0 };
  // root mode: --root <dir> [--port <n>]
  const rootIdx = argv.indexOf('--root');
  if (rootIdx >= 0) {
    const rootDir = argv[rootIdx + 1];
    if (!rootDir || rootDir.startsWith('--')) return { mode: 'help', port: 0 };
    let port = 6419;
    const portIdx = argv.indexOf('--port');
    if (portIdx >= 0) {
      const v = argv[portIdx + 1];
      if (!v) return { mode: 'help', port: 0 };
      port = parseInt(v, 10);
      if (Number.isNaN(port) || port < 0) return { mode: 'help', port: 0 };
    }
    return { mode: 'root', rootDir: path.resolve(rootDir), port };
  }
  // single-file mode: <file.md> [port]
  const file = argv[0];
  if (!file) return { mode: 'help', port: 0 };
  const port = argv[1] ? parseInt(argv[1], 10) || 6419 : 6419;
  return { mode: 'file', file: path.resolve(file), port };
}

const args = parseArgs(process.argv.slice(2));

if (args.mode === 'init') {
  console.log('Installing katex and mermaid for offline use...');
  execSync('npm install katex mermaid', { cwd: __dir, stdio: 'inherit' });
  console.log('\nDone. ghmd will now work fully offline.');
  process.exit(0);
}

if (args.mode === 'help') {
  console.error('Usage:');
  console.error('  ghmd <file.md> [port]              Serve a single markdown file');
  console.error('  ghmd --root <dir> [--port <n>]     Serve markdown files under <dir>');
  console.error('                                     (--port 0 picks a free port)');
  console.error('  ghmd --init                        Download KaTeX + Mermaid for offline use');
  process.exit(1);
}

// ---------- assets (loaded once) ----------

const uiCss  = fs.readFileSync(path.join(__dir, 'src', 'ui.css'), 'utf8');
const tocJs  = fs.readFileSync(path.join(__dir, 'src', 'toc.js'), 'utf8');
const scrollSyncJs = fs.readFileSync(path.join(__dir, 'src', 'scroll-sync.js'), 'utf8');
const svgSliderJs = fs.readFileSync(path.join(__dir, 'src', 'svg-slider.js'), 'utf8');

// fileURLToPath, not URL.pathname: on Windows .pathname yields "/C:/…" which
// path.join turns into a bogus "C:\C:\…" double-drive path.
const cssDir = path.dirname(fileURLToPath(import.meta.resolve('github-markdown-css')));
const ghLightCss = fs.readFileSync(path.join(cssDir, 'github-markdown-light.css'), 'utf8');
const ghDarkCss  = fs.readFileSync(path.join(cssDir, 'github-markdown-dark.css'), 'utf8');

const hljsDir = path.join(path.dirname(fileURLToPath(import.meta.resolve('highlight.js'))), '..', 'styles');
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

// ---------- markdown render cache ----------

interface CacheEntry { mtime: number; html: string }
const renderCache = new Map<string, CacheEntry>();

function renderMarkdown(absPath: string, quiet = false): string {
  const mtime = fs.statSync(absPath).mtimeMs;
  const cached = renderCache.get(absPath);
  if (cached && cached.mtime === mtime) return cached.html;
  const md = fs.readFileSync(absPath, 'utf8');
  const out = createMarked(md).parse(md) as string;
  renderCache.set(absPath, { mtime, html: out });
  if (!quiet) console.log(`[${new Date().toLocaleTimeString()}] rendered ${path.basename(absPath)}`);
  return out;
}

function mtimeOf(absPath: string): number {
  try { return fs.statSync(absPath).mtimeMs; } catch { return 0; }
}

// ---------- HTML wrapping ----------

function htmlPage(title: string, body: string, pollQuery = ''): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — ghmd</title>
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
  window.__pollQuery = ${JSON.stringify(pollQuery)};
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
      const r = await fetch('/__poll' + (window.__pollQuery || ''));
      const t = await r.text();
      if (mtime && t !== mtime) location.reload();
      mtime = t;
    } catch {}
  }, 1000);
</script>
</body>
</html>`;
}

// ---------- root-mode helpers ----------

const MD_EXT_RE = /\.(md|markdown)$/i;

interface ResolveResult {
  ok: boolean;
  status?: number;
  error?: string;
  abs?: string;
}

function resolveRootFile(rootDir: string, relRaw: string): ResolveResult {
  // Reject NUL, absolute paths.
  if (relRaw.includes('\0')) return { ok: false, status: 400, error: 'invalid path' };
  if (path.isAbsolute(relRaw)) return { ok: false, status: 400, error: 'absolute paths are not allowed' };
  const abs = path.resolve(rootDir, relRaw);
  // Reject escapes.
  const rel = path.relative(rootDir, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, status: 400, error: 'path escapes root' };
  if (!MD_EXT_RE.test(abs)) return { ok: false, status: 400, error: 'only .md / .markdown are supported' };
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { ok: false, status: 404, error: 'file not found' };
  return { ok: true, abs };
}

function landingPage(rootDir: string): string {
  const body = `<h1>ghmd</h1>
<p>Serving <code>${rootDir}</code>.</p>
<p>Open a markdown file with <code>?file=&lt;relative path&gt;</code>.</p>`;
  return htmlPage('ghmd', body);
}

// ---------- HTTP server ----------

const FONT_TYPES: Record<string, string> = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';

  // Common: offline fonts
  if (offline && url.startsWith('/__fonts/')) {
    const fontPath = path.join(katexFontsDir!, path.basename(url));
    const ext = path.extname(url);
    try {
      res.writeHead(200, { 'Content-Type': FONT_TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000' });
      res.end(fs.readFileSync(fontPath));
    } catch { res.writeHead(404); res.end(); }
    return;
  }

  if (args.mode === 'file') {
    const absFile = args.file!;
    if (url === '/__poll') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(String(mtimeOf(absFile)));
      return;
    }
    const body = renderMarkdown(absFile);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlPage(path.basename(absFile), body));
    return;
  }

  // root mode
  const rootDir = args.rootDir!;
  // Parse query
  const idx = url.indexOf('?');
  const qs = idx >= 0 ? new URLSearchParams(url.slice(idx + 1)) : new URLSearchParams();
  const fileParam = qs.get('file');

  if (url.startsWith('/__poll')) {
    if (!fileParam) { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('0'); return; }
    const r = resolveRootFile(rootDir, fileParam);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(String(r.ok ? mtimeOf(r.abs!) : 0));
    return;
  }

  if (!fileParam) {
    // landing — try README.md, else default landing
    const readme = path.join(rootDir, 'README.md');
    if (fs.existsSync(readme)) {
      const body = renderMarkdown(readme);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlPage('README.md', body, '?file=README.md'));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(landingPage(rootDir));
    return;
  }

  const r = resolveRootFile(rootDir, fileParam);
  if (!r.ok) {
    res.writeHead(r.status!, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`ghmd: ${r.error}\n`);
    return;
  }
  const body = renderMarkdown(r.abs!);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlPage(path.basename(r.abs!), body, `?file=${encodeURIComponent(fileParam)}`));
});

server.listen(args.port, '127.0.0.1', () => {
  const addr = server.address() as AddressInfo;
  const actualPort = addr.port;
  // First stdout line MUST be machine-parseable so parent processes can pick up the port.
  process.stdout.write(`LISTENING http://127.0.0.1:${actualPort}\n`);
  console.log(`\n  ghmd — local GitHub-style Markdown viewer`);
  console.log(`  Mode:  ${offline ? 'offline (local assets)' : 'online (CDN for KaTeX + Mermaid)'}`);
  if (args.mode === 'file') {
    console.log(`  File:  ${args.file}`);
  } else {
    console.log(`  Root:  ${args.rootDir}`);
  }
  console.log(`  URL:   http://127.0.0.1:${actualPort}`);
  if (!offline) console.log(`\n  Tip: run "ghmd --init" for fully offline use`);
  console.log();

  // Pre-render in single-file mode (preserves snappy first request).
  if (args.mode === 'file') {
    try { renderMarkdown(args.file!, true); } catch { /* ignore — error will surface on request */ }
  }
});
