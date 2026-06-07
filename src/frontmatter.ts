import yaml from 'js-yaml';
import { Marked, type TokenizerAndRendererExtension, type Tokens } from 'marked';
import { escHtml } from './escape.js';

const inlineMarked = new Marked({
  tokenizer: {
    tag() { return undefined; },
  },
});

function renderInline(s: string): string {
  return inlineMarked.parseInline(s) as string;
}

function formatValue(val: unknown): string {
  if (Array.isArray(val)) return val.map(formatValue).join(', ');
  if (val && typeof val === 'object') return escHtml(JSON.stringify(val));
  if (typeof val === 'string') return renderInline(val);
  return escHtml(val as string);
}

export function createFrontmatterExtension(): TokenizerAndRendererExtension {
  // Frontmatter is only valid at the very top of the document. marked invokes
  // block tokenizers repeatedly, once per block position; the FIRST call always
  // receives the full document as `src`. So we only ever attempt a match on that
  // first call, then disable ourselves. This stops a `---\n…\n---` block in the
  // body (a thematic break + content) from being mistaken for frontmatter.
  let firstCall = true;
  return {
    name: 'frontmatter',
    level: 'block',
    start(src) {
      if (!firstCall) return;
      return src.match(/^---\s*\n/)?.index;
    },
    tokenizer(src) {
      if (!firstCall) return;
      firstCall = false;
      const match = src.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
      if (!match) return;
      // Only treat it as frontmatter if the body parses to a YAML mapping;
      // otherwise let the standard tokenizers handle the `---` (hr / setext),
      // so we never swallow a leading scalar/list as empty metadata.
      let data: unknown;
      try { data = yaml.load(match[1]); } catch { return; }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      return { type: 'frontmatter', raw: match[0], text: match[1], data };
    },
    renderer(token: Tokens.Generic) {
      const data = (token as Tokens.Generic & { data?: unknown }).data;
      if (!data || typeof data !== 'object') return '';
      const rows = Object.entries(data).map(([k, v]) =>
        `<tr><th>${escHtml(k)}</th><td>${formatValue(v)}</td></tr>`
      ).join('');
      return `<table>${rows}</table>\n`;
    }
  };
}
