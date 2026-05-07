import type { TokenizerAndRendererExtension, Tokens } from 'marked';

// Intercept $$...$$ and $...$ at tokenization time so the LaTeX content never goes
// through marked's inline parser — otherwise `<T>` becomes a real HTML element,
// `\_` collapses to `_`, and KaTeX can't find matching delimiters in the DOM.

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const blockRe = /^\$\$([\s\S]+?)\$\$(?:\n|$)/;
const inlineRe = /^\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?!\d)/;

export function createMathExtensions(): TokenizerAndRendererExtension[] {
  return [
    {
      name: 'mathBlock',
      level: 'block',
      start(src) {
        return src.match(/(^|\n)\$\$/)?.index;
      },
      tokenizer(src) {
        const m = blockRe.exec(src);
        if (!m) return;
        const text = m[1].replace(/^\n+/, '').replace(/\n+$/, '');
        return { type: 'mathBlock', raw: m[0], text };
      },
      renderer(token: Tokens.Generic) {
        return `<div class="math-block">$$${escHtml(token.text)}$$</div>\n`;
      },
    },
    {
      name: 'mathInline',
      level: 'inline',
      start(src) {
        const m = src.match(/(?<!\\)\$(?!\$)/);
        return m?.index;
      },
      tokenizer(src) {
        if (src.startsWith('$$')) return;
        const m = inlineRe.exec(src);
        if (!m) return;
        return { type: 'mathInline', raw: m[0], text: m[1] };
      },
      renderer(token: Tokens.Generic) {
        return `<span class="math-inline">$${escHtml(token.text)}$</span>`;
      },
    },
  ];
}
