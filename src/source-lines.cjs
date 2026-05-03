// Marked extension: annotates block tokens with source line numbers via walkTokens,
// then wraps existing renderer output with data-source-line attributes.
// Registered LAST so it wraps whatever renderer is currently active (alert, highlight, etc.).

const { Renderer } = require('marked');

const BLOCK_TYPES = ['heading', 'paragraph', 'code', 'table', 'blockquote', 'list', 'hr', 'html'];

function sourceLines(markdown) {
  const offsets = [0];
  for (let i = 0; i < markdown.length; i++) {
    if (markdown[i] === '\n') offsets.push(i + 1);
  }
  function charToLine(pos) {
    let lo = 0, hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  }

  let cursor = 0;

  return {
    walkTokens(token) {
      if (!BLOCK_TYPES.includes(token.type)) return;
      const idx = markdown.indexOf(token.raw, cursor);
      if (idx >= 0) { token._line = charToLine(idx); cursor = idx; }
    }
  };
}

// Call AFTER all plugins are registered on a Marked instance.
// Snapshots the current renderer, then registers a wrapper that injects data-source-line.
function applySourceLineWrappers(marked) {
  const prev = { ...marked.defaults.renderer };
  const proto = Renderer.prototype;
  const wrappers = {};
  for (const type of BLOCK_TYPES) {
    const original = prev[type] || proto[type];
    wrappers[type] = function (token) {
      const html = original.call(this, token);
      if (!token._line || !html) return html;
      return html.replace(/^(<\w+)/, `$1 data-source-line="${token._line}"`);
    };
  }
  marked.use({ renderer: wrappers });
}

module.exports = { sourceLines, applySourceLineWrappers };
