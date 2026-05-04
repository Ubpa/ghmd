import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Marked } from 'marked';
import markedAlert from 'marked-alert';
import markedFootnote from 'marked-footnote';
import { frontmatterExtension } from './frontmatter.js';
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

let activePanel: vscode.WebviewPanel | null = null;
let activeKey: string | null = null;
let activeTheme: 'light' | 'dark' = 'light';
let changeDocSub: vscode.Disposable | null = null;
let scrollSyncSub: vscode.Disposable | null = null;
let lastRenderedHtml = '';
let scrollSyncSource: 'editor' | 'preview' | null = null;
let scrollSyncTimer: ReturnType<typeof setTimeout> | null = null;

export function activate(context: vscode.ExtensionContext): void {
  vscode.commands.executeCommand('setContext', 'hasCustomMarkdownPreview', true);
  context.subscriptions.push(
    vscode.commands.registerCommand('ghmd.openPreview', () => openPreview(context, false)),
    vscode.commands.registerCommand('ghmd.openPreviewToSide', () => openPreview(context, true)),
    vscode.commands.registerCommand('ghmd.zoomIn', () => { if (activePanel) activePanel.webview.postMessage({ type: 'zoom', delta: 10 }); }),
    vscode.commands.registerCommand('ghmd.zoomOut', () => { if (activePanel) activePanel.webview.postMessage({ type: 'zoom', delta: -10 }); }),
    vscode.commands.registerCommand('ghmd.zoomReset', () => { if (activePanel) activePanel.webview.postMessage({ type: 'zoom', reset: true }); }),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (!activePanel || !editor || editor.document.languageId !== 'markdown') return;
      followEditor(editor.document, context);
    }),
  );
}

function followEditor(doc: vscode.TextDocument, context: vscode.ExtensionContext): void {
  const key = doc.uri.toString();
  if (key === activeKey) return;
  activeKey = key;
  lastRenderedHtml = '';
  activePanel!.title = `Preview: ${path.basename(doc.fileName)}`;
  if (changeDocSub) changeDocSub.dispose();
  changeDocSub = vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document.uri.toString() === activeKey) {
      updatePreview(activePanel!, e.document, context);
    }
  });
  updatePreview(activePanel!, doc, context);
}

function openPreview(context: vscode.ExtensionContext, toSide: boolean): void {
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
      localResourceRoots: [],
    },
  );

  activeKey = doc.uri.toString();

  activePanel.webview.onDidReceiveMessage(msg => {
    if (msg.type === 'themeChanged') {
      activeTheme = msg.theme;
      const currentDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === activeKey);
      if (currentDoc) updatePreview(activePanel!, currentDoc, context);
    }
    if (msg.type === 'revealLine') {
      scrollSyncSource = 'preview';
      if (scrollSyncTimer) clearTimeout(scrollSyncTimer);
      scrollSyncTimer = setTimeout(() => { scrollSyncSource = null; }, 300);
      const ed = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === activeKey);
      if (ed) {
        const line = Math.max(0, msg.line - 1);
        const range = new vscode.Range(line, 0, line, 0);
        ed.revealRange(range, vscode.TextEditorRevealType.AtTop);
      }
    }
  });

  changeDocSub = vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document.uri.toString() === activeKey) {
      updatePreview(activePanel!, e.document, context);
    }
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

  updatePreview(activePanel, doc, context);

  activePanel.onDidChangeViewState(e => {
    vscode.commands.executeCommand('setContext', 'ghmd.previewActive', e.webviewPanel.active);
  });

  activePanel.onDidDispose(() => {
    vscode.commands.executeCommand('setContext', 'ghmd.previewActive', false);
    activePanel = null;
    activeKey = null;
    lastRenderedHtml = '';
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
  marked.use(sourceLines(markdown));
  applySourceLineWrappers(marked);
  return marked;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updatePreview(panel: vscode.WebviewPanel, doc: vscode.TextDocument, context: vscode.ExtensionContext): void {
  const text = doc.getText();
  const marked = getMarked(text);
  let body: string;
  try {
    body = marked.parse(text) as string;
  } catch (err) {
    vscode.window.showErrorMessage(`GHMD: render failed — ${(err as Error).message}`);
    return;
  }

  const mode = activeTheme;
  const isDark = mode === 'dark';

  const ghCdn = isDark
    ? 'https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown-dark.css'
    : 'https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown-light.css';
  const hljsCdn = isDark
    ? 'https://cdn.jsdelivr.net/npm/highlight.js/styles/github-dark.css'
    : 'https://cdn.jsdelivr.net/npm/highlight.js/styles/github.css';

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
<link rel="stylesheet" href="${ghCdn}">
<link rel="stylesheet" href="${hljsCdn}">
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
<div class="ghmd-wrapper markdown-body">
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

  function addSvgSliders() {
    document.querySelectorAll('pre.mermaid svg').forEach(svg => {
      if (svg._hasSlider) return;
      svg._hasSlider = true;
      const pre = svg.closest('pre');
      const vb = svg.getAttribute('viewBox');
      if (!vb) return;
      const intrinsicW = parseFloat(vb.split(' ')[2]);
      if (!intrinsicW) return;

      const wrap = document.createElement('div');
      wrap.className = 'mermaid-wrap';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      const bar = document.createElement('div');
      bar.className = 'svg-slider';
      bar.innerHTML = '<button class="zoom-btn svg-minus">−</button><input type="range" min="20" max="300" value="100"><button class="zoom-btn svg-plus">+</button><button class="zoom-btn svg-reset">↺</button><span>100%</span>';
      wrap.appendChild(bar);

      const slider = bar.querySelector('input');
      const label = bar.querySelector('span');
      function setSvgWidth(pct) {
        slider.value = pct;
        label.textContent = pct + '%';
        if (pct === 100) { svg.style.width = ''; svg.style.maxWidth = ''; }
        else { svg.style.width = (intrinsicW * pct / 100) + 'px'; svg.style.maxWidth = 'none'; }
      }
      slider.addEventListener('input', () => setSvgWidth(parseInt(slider.value)));
      bar.querySelector('.svg-minus').addEventListener('click', () => setSvgWidth(parseInt(slider.value) - 10));
      bar.querySelector('.svg-plus').addEventListener('click', () => setSvgWidth(parseInt(slider.value) + 10));
      bar.querySelector('.svg-reset').addEventListener('click', () => setSvgWidth(100));
    });
  }
  new MutationObserver(addSvgSliders).observe(document.querySelector('.ghmd-wrapper'), { childList: true, subtree: true });

  const initTheme = document.documentElement.getAttribute('data-theme');
  mermaid.initialize({ startOnLoad: true, theme: initTheme === 'dark' ? 'dark' : 'default' });
  buildToc();

  ${scrollSyncJs}
  initScrollSync(msg => vscode.postMessage(msg));

  const wrapper = document.querySelector('.ghmd-wrapper');
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

  window.addEventListener('message', e => {
    if (e.data.type === 'scrollToLine') scrollToLine(e.data.line);
    if (e.data.type === 'zoom') applyZoom(e.data.reset ? 100 : _zoom + e.data.delta);
  });
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
