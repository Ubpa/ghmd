const vscode = require('vscode');
const path = require('path');
const { Marked } = require('marked');
const markedAlert = require('marked-alert');
const markedFootnote = require('marked-footnote');
const hljs = require('highlight.js');
const fs = require('fs');

const panels = new Map();
const panelThemes = new Map();

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ghmd.openPreview', () => openPreview(context, false)),
    vscode.commands.registerCommand('ghmd.openPreviewToSide', () => openPreview(context, true)),
  );
}

function openPreview(context, toSide) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showWarningMessage('GHMD: Open a Markdown file first');
    return;
  }

  const doc = editor.document;
  const key = doc.uri.toString();

  if (panels.has(key)) {
    panels.get(key).reveal();
    return;
  }

  const column = toSide
    ? (editor.viewColumn || vscode.ViewColumn.One) + 1
    : editor.viewColumn || vscode.ViewColumn.One;

  const panel = vscode.window.createWebviewPanel(
    'ghmd.preview',
    `Preview: ${path.basename(doc.fileName)}`,
    { viewColumn: column, preserveFocus: true },
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, 'vendor')),
      ],
    },
  );

  panels.set(key, panel);

  panel.webview.onDidReceiveMessage(msg => {
    if (msg.type === 'themeChanged') {
      panelThemes.set(key, msg.theme);
    }
  });

  updatePreview(panel, doc, context, key);

  const changeDoc = vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document.uri.toString() === key) {
      updatePreview(panel, e.document, context, key);
    }
  });

  panel.onDidDispose(() => {
    panels.delete(key);
    panelThemes.delete(key);
    changeDoc.dispose();
  });
}

function getMarked() {
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
  return marked;
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function vendor(context, ...segments) {
  return fs.readFileSync(path.join(context.extensionPath, 'vendor', ...segments), 'utf8');
}

function updatePreview(panel, doc, context, key) {
  const marked = getMarked();
  const body = marked.parse(doc.getText());

  const ghLightCss   = vendor(context, 'css', 'github-markdown-light.css');
  const ghDarkCss    = vendor(context, 'css', 'github-markdown-dark.css');
  const hljsLightCss = vendor(context, 'css', 'hljs-light.css');
  const hljsDarkCss  = vendor(context, 'css', 'hljs-dark.css');

  const katexCssLocal        = vendor(context, 'katex', 'katex.min.css');
  const katexJsLocal         = vendor(context, 'katex', 'katex.min.js');
  const katexAutoRenderLocal = vendor(context, 'katex', 'auto-render.min.js');
  const mermaidJsLocal       = vendor(context, 'mermaid.min.js');

  const katexFontsUri = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'vendor', 'katex', 'fonts'))
  );

  const mode = panelThemes.get(key) || 'light';

  const nonce = getNonce();

  panel.webview.html = `<!DOCTYPE html>
<html lang="en" data-theme="${mode}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; img-src ${panel.webview.cspSource} https: data:; font-src ${panel.webview.cspSource} https://cdn.jsdelivr.net;">
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
    max-width: 980px;
    margin: 0 auto;
    padding: 32px 45px;
  }
  @media (max-width: 767px) { .ghmd-wrapper { padding: 15px; } }

  .theme-toggle {
    position: fixed; top: 12px; right: 12px; z-index: 999;
    width: 36px; height: 36px;
    border: 1px solid #d0d7de; border-radius: 8px;
    background: #f6f8fa; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; line-height: 1;
    transition: background 0.2s, border-color 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  html[data-theme="dark"] .theme-toggle { background: #21262d; border-color: #30363d; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
  .theme-toggle:hover { opacity: 0.8; }
  .theme-toggle .icon-sun, .theme-toggle .icon-moon { display: none; }
  html[data-theme="light"] .theme-toggle .icon-moon { display: block; }
  html[data-theme="dark"]  .theme-toggle .icon-sun  { display: block; }

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
<!-- KaTeX: CDN first, local fallback -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css"
      onerror="document.getElementById('katex-css-local').disabled=false; this.remove();">
<style id="katex-css-local" disabled>${katexCssLocal.replace(/url\(fonts\//g, `url(${katexFontsUri}/`)}</style>

<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js"
        onerror="this.__failed=true"></script>
<script nonce="${nonce}">if(!window.katex){${katexJsLocal}}</script>

<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js"
        onerror="this.__failed=true"></script>
<script nonce="${nonce}">if(!window.renderMathInElement){${katexAutoRenderLocal}}</script>

<!-- Mermaid: CDN first, local fallback -->
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"
        onerror="this.__failed=true"></script>
<script nonce="${nonce}">if(!window.mermaid){${mermaidJsLocal}}</script>
</head>
<body>
<button class="theme-toggle" id="themeBtn" title="Toggle theme">
  <span class="icon-sun">☀️</span>
  <span class="icon-moon">🌙</span>
</button>
<div class="ghmd-wrapper markdown-body">
${body}
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
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

  document.getElementById('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    vscode.postMessage({ type: 'themeChanged', theme: next });
    document.querySelectorAll('.mermaid[data-processed],.mermaid svg').forEach(el => {
      const pre = el.closest('pre') || el;
      if (pre._originalText) { pre.removeAttribute('data-processed'); pre.innerHTML = pre._originalText; }
    });
    mermaid.initialize({ startOnLoad: false, theme: next === 'dark' ? 'dark' : 'default' });
    mermaid.run();
  });

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
</script>
</body>
</html>`;
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  return nonce;
}

function deactivate() {
  panels.forEach(p => p.dispose());
  panels.clear();
}

module.exports = { activate, deactivate };
