// Client-side scroll sync (inlined into both server and VS Code extension).
// Requires elements to have data-source-line attributes (set by source-lines.cjs).

let _syncSource = null;
let _syncTimer = null;

function scrollToLine(line) {
  const els = document.querySelectorAll('[data-source-line]');
  if (!els.length) return;
  let best = els[0];
  for (const el of els) {
    if (parseInt(el.dataset.sourceLine) <= line) best = el;
    else break;
  }
  _syncSource = 'editor';
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => { _syncSource = null; }, 300);
  best.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getTopVisibleLine() {
  const els = document.querySelectorAll('[data-source-line]');
  for (const el of els) {
    const rect = el.getBoundingClientRect();
    if (rect.top >= -10) return parseInt(el.dataset.sourceLine);
  }
  return 1;
}

function initScrollSync(postMessage) {
  let scrollTimer = null;
  window.addEventListener('scroll', () => {
    if (_syncSource === 'editor') return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      _syncSource = 'preview';
      clearTimeout(_syncTimer);
      _syncTimer = setTimeout(() => { _syncSource = null; }, 300);
      postMessage({ type: 'revealLine', line: getTopVisibleLine() });
    }, 100);
  });
}
