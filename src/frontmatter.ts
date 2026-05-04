import yaml from 'js-yaml';
import type { TokenizerAndRendererExtension, Tokens } from 'marked';

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatValue(val: unknown): string {
  if (Array.isArray(val)) return escHtml(val.join(', '));
  if (val && typeof val === 'object') return escHtml(JSON.stringify(val));
  return escHtml(val as string);
}

export const frontmatterExtension: TokenizerAndRendererExtension = {
  name: 'frontmatter',
  level: 'block',
  start(src) {
    return src.match(/^---\s*\n/)?.index;
  },
  tokenizer(src) {
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
