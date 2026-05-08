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
  let done = false;
  return {
    name: 'frontmatter',
    level: 'block',
    start(src) {
      if (done) return;
      return src.match(/^---\s*\n/)?.index;
    },
    tokenizer(src) {
      if (done) return;
      done = true;
      const match = src.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
      if (!match) return;
      return { type: 'frontmatter', raw: match[0], text: match[1] };
    },
    renderer(token: Tokens.Generic) {
      let data;
      try { data = yaml.load(token.text); } catch { return ''; }
      if (!data || typeof data !== 'object') return '';
      const rows = Object.entries(data).map(([k, v]) =>
        `<tr><th>${escHtml(k)}</th><td>${formatValue(v)}</td></tr>`
      ).join('');
      return `<table>${rows}</table>\n`;
    }
  };
}
