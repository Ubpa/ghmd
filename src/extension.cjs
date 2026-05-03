const vscode = require('vscode');
const path = require('path');
const { Marked } = require('marked');
const markedAlert = require('marked-alert');
const markedFootnote = require('marked-footnote');
const { frontmatterExtension } = require('./frontmatter.cjs');
const { markedHighlight } = require('marked-highlight');
const { markedEmoji } = require('marked-emoji');
const markedLinkifyIt = require('marked-linkify-it');
const hljs = require('highlight.js');
const { gemoji } = require('gemoji');
const fs = require('fs');

const emojiMap = {};
gemoji.forEach(e => e.names.forEach(n => { emojiMap[n] = e.emoji; }));

const { sourceLines, applySourceLineWrappers } = require('./source-lines.cjs');

const uiCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.css'), 'utf8');
const tocJs  = fs.readFileSync(path.join(__dirname, '..', 'src', 'toc.js'), 'utf8');
const scrollSyncJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'scroll-sync.js'), 'utf8');

let activePanel = null;
let activeKey = null;
let activeTheme = 'light';
let changeDocSub = null;
let scrollSyncSub = null;
let lastRenderedHtml = '';

function activate(context) {
  vscode.commands.executeCommand('setContext', 'hasCustomMarkdownPreview', true);
  context.subscriptions.push(
    vscode.commands.registerCommand('ghmd.openPreview', () => openPreview(context, false)),
    vscode.commands.registerCommand('ghmd.openPreviewToSide', () => openPreview(context, true)),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (!activePanel || !editor || editor.document.languageId !== 'markdown') return;
      followEditor(editor.document, context);
    }),
  );
}

function followEditor(doc, context) {
  const key = doc.uri.toString();
  if (key === activeKey) return;
  activeKey = key;
  lastRenderedHtml = '';
  activePanel.title = `Preview: ${path.basename(doc.fileName)}`;
  if (changeDocSub) changeDocSub.dispose();
  changeDocSub = vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document.uri.toString() === activeKey) {
      updatePreview(activePanel, e.document, context);
    }
  });
  updatePreview(activePanel, doc, context);
}

function openPreview(context, toSide) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showWarningMessage('GHMD: Open a Markdown file first');
    return;
  }

  const doc = editor.document;

  if (activePanel) {
    activePanel.reveal();
    followEditor(doc, context);
    return;
  }

  const column = toSide
    ? (editor.viewColumn || vscode.ViewColumn.One) + 1
    : editor.viewColumn || vscode.ViewColumn.One;

  activePanel = vscode.window.createWebviewPanel(
    'ghmd.preview',
    `Preview: ${path.basename(doc.fileName)}`,
    { viewColumn: column, preserveFocus: true },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, 'vendor')),
      ],
    },
  );

  activeKey = doc.uri.toString();

  activePanel.webview.onDidReceiveMessage(msg => {
    if (msg.type === 'themeChanged') {
      activeTheme = msg.theme;
      const currentDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === activeKey);
      if (currentDoc) updatePreview(activePanel, currentDoc, context);
    }
    if (msg.type === 'revealLine') {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.uri.toString() === activeKey) {
        const line = Math.max(0, msg.line - 1);
        const range = new vscode.Range(line, 0, line, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
      }
    }
  });

  changeDocSub = vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document.uri.toString() === activeKey) {
      updatePreview(activePanel, e.document, context);
    }
  });

  scrollSyncSub = vscode.window.onDidChangeTextEditorVisibleRanges(e => {
    if (!activePanel || e.textEditor.document.uri.toString() !== activeKey) return;
    const line = e.visibleRanges[0]?.start.line + 1;
    if (line) activePanel.webview.postMessage({ type: 'scrollToLine', line });
  });

  updatePreview(activePanel, doc, context);

  activePanel.onDidDispose(() => {
    activePanel = null;
    activeKey = null;
    lastRenderedHtml = '';
    if (changeDocSub) { changeDocSub.dispose(); changeDocSub = null; }
    if (scrollSyncSub) { scrollSyncSub.dispose(); scrollSyncSub = null; }
  });
}

function slugify(text) {
  return text.replace(/<[^>]+>/g, '').trim()
    .toLowerCase().replace(/[^\w一-鿿\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function getMarked(markdown) {
  const marked = new Marked();
  // frontmatter MUST be registered before footnote — reverse order crashes on files with both
  marked.use({ extensions: [frontmatterExtension] });
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
  marked.use({
    renderer: {
      heading({ text, depth }) {
        const id = slugify(text);
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
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
  // Source line tracking: walkTokens annotates _line, wrappers inject data-source-line
  marked.use(sourceLines(markdown));
  applySourceLineWrappers(marked);
  return marked;
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function vendor(context, ...segments) {
  return fs.readFileSync(path.join(context.extensionPath, 'vendor', ...segments), 'utf8');
}

function updatePreview(panel, doc, context) {
  const text = doc.getText();
  const marked = getMarked(text);
  let body;
  try {
    body = marked.parse(text);
  } catch (err) {
    vscode.window.showErrorMessage(`GHMD: render failed — ${err.message}`);
    return;
  }

  const mode = activeTheme;
  const isDark = mode === 'dark';

  const ghCss   = vendor(context, 'css', isDark ? 'github-markdown-dark.css' : 'github-markdown-light.css');
  const hljsCss = vendor(context, 'css', isDark ? 'hljs-dark.css' : 'hljs-light.css');

  const katexFontsUri = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'vendor', 'katex', 'fonts'))
  );
  const katexCssLocal        = vendor(context, 'katex', 'katex.min.css');
  const katexJsLocal         = vendor(context, 'katex', 'katex.min.js');
  const katexAutoRenderLocal = vendor(context, 'katex', 'auto-render.min.js');
  const mermaidJsLocal       = vendor(context, 'mermaid.min.js');

  const cacheKey = body + mode;
  if (cacheKey === lastRenderedHtml) return;
  lastRenderedHtml = cacheKey;

  const nonce = getNonce();

  panel.webview.html = `<!DOCTYPE html>
<html lang="en" data-theme="${mode}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="${isDark ? 'dark' : 'only light'}">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; img-src ${panel.webview.cspSource} https: data:; font-src ${panel.webview.cspSource} https://cdn.jsdelivr.net;">
<style>${ghCss}</style>
<style>${hljsCss}</style>
<style>
  /* VS Code-specific overrides; shared UI is in src/ui.css */
  /* Match github-markdown-css body backgrounds so VS Code's dark body doesn't bleed through padding */
  html[data-theme="light"] { background: #ffffff; color-scheme: only light; }
  html[data-theme="dark"]  { background: #0d1117; color-scheme: only dark; }
  /* VS Code's webview default CSS fills in properties github-markdown intentionally omits. */
  .markdown-body blockquote { background-color: transparent; }
  .markdown-body code, .markdown-body tt { color: inherit; }
  .ghmd-wrapper { padding: 32px 45px; }
  @media (max-width: 767px) { .ghmd-wrapper { padding: 15px; } }
  /* Extension toolbar is slightly smaller */
  .toolbar { top: 12px; right: 12px; }
  .toolbar button { width: 36px; height: 36px; font-size: 18px; }
  .toc-panel { top: 56px; right: 12px; max-height: calc(100vh - 70px); }
</style>
<style>${uiCss}</style>
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
<div class="toolbar">
  <button class="toc-toggle" id="tocBtn" title="Table of contents">☰</button>
  <button class="theme-toggle" id="themeBtn" title="Toggle theme">
    <span class="icon-sun">☀️</span>
    <span class="icon-moon">🌙</span>
  </button>
</div>
<div class="ghmd-wrapper markdown-body">
<nav class="toc-panel" id="tocPanel"></nav>
${body}
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  ${tocJs}

  document.getElementById('tocBtn').addEventListener('click', () => {
    document.getElementById('tocPanel').classList.toggle('open');
  });

  document.getElementById('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    vscode.postMessage({ type: 'themeChanged', theme: next });
    document.querySelectorAll('.mermaid[data-processed],.mermaid svg').forEach(el => {
      const pre = el.closest('pre') || el;
      if (pre._originalText) { pre.removeAttribute('data-processed'); pre.innerHTML = pre._originalText; }
    });
    mermaid.initialize({ startOnLoad: false, theme: next === 'dark' ? 'dark' : 'default' });
    mermaid.run();
  });

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

  ${scrollSyncJs}
  initScrollSync(msg => vscode.postMessage(msg));
  window.addEventListener('message', e => {
    if (e.data.type === 'scrollToLine') scrollToLine(e.data.line);
  });
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
  if (activePanel) { activePanel.dispose(); activePanel = null; }
  if (changeDocSub) { changeDocSub.dispose(); changeDocSub = null; }
}

module.exports = { activate, deactivate };
