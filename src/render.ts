import { Marked } from 'marked';
import markedAlert from 'marked-alert';
import markedFootnote from 'marked-footnote';
import { markedHighlight } from 'marked-highlight';
import { markedEmoji } from 'marked-emoji';
import markedLinkifyIt from 'marked-linkify-it';
import hljs from 'highlight.js';
import { gemoji } from 'gemoji';
import { createFrontmatterExtension } from './frontmatter.js';
import { createMathExtensions } from './math.js';
import { createHeadingRenderer } from './heading.js';
import { sourceLines, applySourceLineWrappers } from './source-lines.js';
import { escHtml } from './escape.js';

const emojiMap: Record<string, string> = {};
gemoji.forEach(e => e.names.forEach(n => { emojiMap[n] = e.emoji; }));

export function createMarked(markdown: string): Marked {
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
  marked.use(createHeadingRenderer());
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
        return false;
      }
    }
  });
  marked.use(sourceLines(markdown));
  applySourceLineWrappers(marked);
  return marked;
}
