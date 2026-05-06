import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Marked } from 'marked';
import markedAlert from 'marked-alert';
import markedFootnote from 'marked-footnote';
import { createFrontmatterExtension } from './frontmatter.js';
import { createMathExtensions } from './math.js';
import { markedHighlight } from 'marked-highlight';
import { markedEmoji } from 'marked-emoji';
import markedLinkifyIt from 'marked-linkify-it';
import hljs from 'highlight.js';
import { gemoji } from 'gemoji';
import { sourceLines, applySourceLineWrappers } from './source-lines.js';

const emojiMap: Record<string, string> = {};
gemoji.forEach(e => e.names.forEach(n => { emojiMap[n] = e.emoji; }));

const uiCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.css'), 'utf8');
const tocJs  = fs.readFileSync(path.join(__dirname, '..', 'src', 'toc.js'), 'utf8');
const scrollSyncJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'scroll-sync.js'), 'utf8');
const svgSliderJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'svg-slider.js'), 'utf8');

const DEBOUNCE_MS = 150;
const CDN = {
  ghLight: 'https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown-light.css',
  ghDark: 'https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown-dark.css',
  hljsLight: 'https://cdn.jsdelivr.net/npm/highlight.js/styles/github.css',
  hljsDark: 'https://cdn.jsdelivr.net/npm/highlight.js/styles/github-dark.css',
};

let activePanel: vscode.WebviewPanel | null = null;
let activeKey: string | null = null;
let activeTheme: 'light' | 'dark' = 'light';
let changeDocSub: vscode.Disposable | null = null;
let scrollSyncSub: vscode.Disposable | null = null;
let lastRenderedHtml = '';
let scrollSyncSource: 'editor' | 'preview' | null = null;
let scrollSyncTimer: ReturnType<typeof setTimeout> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let shellReady = false;
let pendingUpdate: vscode.TextDocument | null = null;

export function activate(context: vscode.ExtensionContext): void {
  vscode.commands.executeCommand('setContext', 'hasCustomMarkdownPreview', true);
  context.subscriptions.push(
    vscode.commands.registerCommand('ghmd.openPreview', () => openPreview(context, false)),
    vscode.commands.registerCommand('ghmd.openPreviewToSide', () => openPreview(context, true)),
    vscode.commands.registerCommand('ghmd.zoomIn', () => { if (activePanel) activePanel.webview.postMessage({ type: 'zoom', delta: 10 }); }),
    vscode.commands.registerCommand('ghmd.zoomOut', () => { if (activePanel) activePanel.webview.postMessage({ type: 'zoom', delta: -10 }); }),
    vscode.commands.registerCommand('ghmd.zoomReset', () => { if (activePanel) activePanel.webview.postMessage({ type: 'zoom', reset: true }); }),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (!activePanel || !editor || !editor.document.fileName.endsWith('.md')) return;
      followEditor(editor.document);
    }),
  );
}

function followEditor(doc: vscode.TextDocument): void {
  const key = doc.uri.toString();
  if (key === activeKey) return;
  activeKey = key;
  lastRenderedHtml = '';
  activePanel!.title = `Preview: ${path.basename(doc.fileName)}`;
  if (changeDocSub) changeDocSub.dispose();
  changeDocSub = vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document.uri.toString() === activeKey) debouncedUpdate(e.document);
  });
  sendContentUpdate(doc);
}

function debouncedUpdate(doc: vscode.TextDocument): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => sendContentUpdate(doc), DEBOUNCE_MS);
}

function openPreview(context: vscode.ExtensionContext, toSide: boolean): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.document.fileName.endsWith('.md')) {
    vscode.window.showWarningMessage('GHMD: Open a Markdown file first');
    return;
  }

  const doc = editor.document;

  if (activePanel) {
    activePanel.reveal();
    followEditor(doc);
    return;
  }

  const column = toSide
    ? (editor.viewColumn || vscode.ViewColumn.One) + 1
    : editor.viewColumn || vscode.ViewColumn.One;

  activePanel = vscode.window.createWebviewPanel(
    'ghmd.preview',
    `Preview: ${path.basename(doc.fileName)}`,
    { viewColumn: column, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
  );

  activeKey = doc.uri.toString();
  shellReady = false;
  pendingUpdate = null;

  activePanel.webview.onDidReceiveMessage(msg => {
    if (msg.type === 'ready') {
      shellReady = true;
      if (pendingUpdate) { sendContentUpdate(pendingUpdate); pendingUpdate = null; }
    }
    if (msg.type === 'themeChanged') {
      activeTheme = msg.theme;
      lastRenderedHtml = '';
      const isDark = msg.theme === 'dark';
      activePanel!.webview.postMessage({
        type: 'themeChange',
        theme: msg.theme,
        ghCdn: isDark ? CDN.ghDark : CDN.ghLight,
        hljsCdn: isDark ? CDN.hljsDark : CDN.hljsLight,
      });
      const currentDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === activeKey);
      if (currentDoc) sendContentUpdate(currentDoc);
    }
    if (msg.type === 'revealLine') {
      scrollSyncSource = 'preview';
      if (scrollSyncTimer) clearTimeout(scrollSyncTimer);
      scrollSyncTimer = setTimeout(() => { scrollSyncSource = null; }, 300);
      const ed = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === activeKey);
      if (ed) {
        const line = Math.max(0, msg.line - 1);
        ed.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop);
      }
    }
  });

  changeDocSub = vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document.uri.toString() === activeKey) debouncedUpdate(e.document);
  });

  scrollSyncSub = vscode.window.onDidChangeTextEditorVisibleRanges(e => {
    if (scrollSyncSource === 'preview') return;
    if (!activePanel || e.textEditor.document.uri.toString() !== activeKey) return;
    scrollSyncSource = 'editor';
    if (scrollSyncTimer) clearTimeout(scrollSyncTimer);
    scrollSyncTimer = setTimeout(() => { scrollSyncSource = null; }, 500);
    const line = e.visibleRanges[0]?.start.line + 1;
    if (line) activePanel.webview.postMessage({ type: 'scrollToLine', line });
  });

  setShellHtml(activePanel);
  sendContentUpdate(doc);

  activePanel.onDidChangeViewState(e => {
    vscode.commands.executeCommand('setContext', 'ghmd.previewActive', e.webviewPanel.active);
  });

  activePanel.onDidDispose(() => {
    vscode.commands.executeCommand('setContext', 'ghmd.previewActive', false);
    activePanel = null;
    activeKey = null;
    lastRenderedHtml = '';
    shellReady = false;
    pendingUpdate = null;
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    if (changeDocSub) { changeDocSub.dispose(); changeDocSub = null; }
    if (scrollSyncSub) { scrollSyncSub.dispose(); scrollSyncSub = null; }
  });
}

function slugify(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim()
    .toLowerCase().replace(/[^\w一-鿿\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function getMarked(markdown: string): Marked {
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
  marked.use(sourceLines(markdown));
  applySourceLineWrappers(marked);
  return marked;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sendContentUpdate(doc: vscode.TextDocument): void {
  if (!activePanel) return;
  if (!shellReady) { pendingUpdate = doc; return; }

  const text = doc.getText();
  const marked = getMarked(text);
  let body: string;
  try {
    body = marked.parse(text) as string;
  } catch (err) {
    vscode.window.showErrorMessage(`GHMD: render failed — ${(err as Error).message}`);
    return;
  }

  const cacheKey = body + activeTheme;
  if (cacheKey === lastRenderedHtml) return;
  lastRenderedHtml = cacheKey;

  activePanel.webview.postMessage({ type: 'update', body, fileKey: activeKey });
}

function setShellHtml(panel: vscode.WebviewPanel): void {
  const nonce = getNonce();
  const isDark = activeTheme === 'dark';

  panel.webview.html = `<!DOCTYPE html>
<html lang="en" data-theme="${activeTheme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta id="color-scheme" name="color-scheme" content="${isDark ? 'dark' : 'only light'}">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; img-src ${panel.webview.cspSource} https: data:; font-src ${panel.webview.cspSource} https://cdn.jsdelivr.net;">
<link id="gh-css" rel="stylesheet" href="${isDark ? CDN.ghDark : CDN.ghLight}">
<link id="hljs-css" rel="stylesheet" href="${isDark ? CDN.hljsDark : CDN.hljsLight}">
<style>
  html[data-theme="light"] { background: #ffffff; color-scheme: only light; }
  html[data-theme="dark"]  { background: #0d1117; color-scheme: only dark; }
  .markdown-body blockquote { background-color: transparent; }
  .markdown-body code, .markdown-body tt { color: inherit; }
  .ghmd-wrapper { padding: 32px 45px; }
  @media (max-width: 767px) { .ghmd-wrapper { padding: 15px; } }
  .toolbar { top: 12px; right: 12px; }
  .toc-panel { top: 48px; right: 12px; max-height: calc(100vh - 60px); }
</style>
<style>${uiCss}</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css">
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js"></script>
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js"></script>
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
</head>
<body>
<div class="toolbar">
  <button class="toc-toggle" id="tocBtn" title="Table of contents">☰</button>
  <button class="theme-toggle" id="themeBtn" title="Toggle theme">
    <span class="icon-sun">☀️</span>
    <span class="icon-moon">🌙</span>
  </button>
</div>
<nav class="toc-panel" id="tocPanel"></nav>
<div class="ghmd-wrapper markdown-body"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const wrapper = document.querySelector('.ghmd-wrapper');
  let _currentFileKey = null;

  ${tocJs}
  ${scrollSyncJs}

  // Toolbar
  document.getElementById('tocBtn').addEventListener('click', () => {
    document.getElementById('tocPanel').classList.toggle('open');
  });
  document.getElementById('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    vscode.postMessage({ type: 'themeChanged', theme: next });
  });

  ${svgSliderJs}
  new MutationObserver(() => addSvgSliders(wrapper)).observe(wrapper, { childList: true, subtree: true });

  // Zoom
  let _zoom = (vscode.getState() || {}).zoom || 100;
  wrapper.style.zoom = _zoom + '%';
  const zoomBar = document.createElement('div');
  zoomBar.className = 'zoom-bar';
  zoomBar.innerHTML = '<button class="zoom-btn" id="zoomOutBtn">−</button>'
    + '<input type="range" id="zoomSlider" min="30" max="300" step="10">'
    + '<button class="zoom-btn" id="zoomInBtn">+</button>'
    + '<button class="zoom-btn" id="zoomResetBtn">↺</button>'
    + '<span id="zoomLabel"></span>';
  document.body.appendChild(zoomBar);
  const zoomSlider = document.getElementById('zoomSlider');
  const zoomLabel = document.getElementById('zoomLabel');
  let zoomHideTimer = null;
  function applyZoom(val) {
    _zoom = Math.max(30, Math.min(300, val));
    wrapper.style.zoom = _zoom + '%';
    zoomSlider.value = _zoom;
    zoomLabel.textContent = _zoom + '%';
    vscode.setState({ ...(vscode.getState() || {}), zoom: _zoom });
    showZoomBar();
  }
  function showZoomBar() {
    zoomBar.classList.add('visible');
    clearTimeout(zoomHideTimer);
    zoomHideTimer = setTimeout(() => zoomBar.classList.remove('visible'), 2000);
  }
  zoomBar.addEventListener('mouseenter', () => { clearTimeout(zoomHideTimer); zoomBar.classList.add('visible'); });
  zoomBar.addEventListener('mouseleave', () => { zoomHideTimer = setTimeout(() => zoomBar.classList.remove('visible'), 1000); });
  zoomSlider.value = _zoom;
  zoomLabel.textContent = _zoom + '%';
  zoomSlider.addEventListener('input', () => applyZoom(parseInt(zoomSlider.value)));
  document.getElementById('zoomOutBtn').addEventListener('click', () => applyZoom(_zoom - 10));
  document.getElementById('zoomInBtn').addEventListener('click', () => applyZoom(_zoom + 10));
  document.getElementById('zoomResetBtn').addEventListener('click', () => applyZoom(100));
  window.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    applyZoom(_zoom + (e.deltaY < 0 ? 5 : -5));
  }, { passive: false });

  // Scroll sync (bind once — querySelectorAll runs on each scroll so new elements are found)
  initScrollSync(msg => vscode.postMessage(msg));

  // Content update handler
  function onContentUpdate(bodyHtml, fileKey) {
    const fileChanged = fileKey !== _currentFileKey;
    _currentFileKey = fileKey;
    if (fileChanged) {
      vscode.setState({ ...(vscode.getState() || {}), fileKey });
      window.scrollTo(0, 0);
    }
    wrapper.innerHTML = bodyHtml;
    document.querySelectorAll('pre.mermaid').forEach(el => { el._originalText = el.textContent; });
    if (typeof renderMathInElement === 'function') {
      renderMathInElement(wrapper, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
        throwOnError: false,
      });
    }
    const theme = document.documentElement.getAttribute('data-theme');
    mermaid.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default' });
    mermaid.run({ nodes: wrapper.querySelectorAll('pre.mermaid') });
    buildToc();
  }

  // Theme change handler
  function onThemeChange(theme, ghCdn, hljsCdn) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('color-scheme').content = theme === 'dark' ? 'dark' : 'only light';
    document.getElementById('gh-css').href = ghCdn;
    document.getElementById('hljs-css').href = hljsCdn;
    document.querySelectorAll('.mermaid[data-processed],.mermaid svg').forEach(el => {
      const pre = el.closest('pre') || el;
      if (pre._originalText) { pre.removeAttribute('data-processed'); pre.innerHTML = pre._originalText; }
    });
    mermaid.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default' });
    mermaid.run();
  }

  // Message dispatcher
  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'update') onContentUpdate(msg.body, msg.fileKey);
    if (msg.type === 'themeChange') onThemeChange(msg.theme, msg.ghCdn, msg.hljsCdn);
    if (msg.type === 'scrollToLine') scrollToLine(msg.line);
    if (msg.type === 'zoom') applyZoom(msg.reset ? 100 : _zoom + msg.delta);
  });

  // Signal ready
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  return nonce;
}

export function deactivate(): void {
  if (activePanel) { activePanel.dispose(); activePanel = null; }
  if (changeDocSub) { changeDocSub.dispose(); changeDocSub = null; }
}
