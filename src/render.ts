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

// Code blocks whose rendering we own — markedHighlight must not pre-process them,
// otherwise token.text arrives as hljs HTML and our custom renderer escapes it.
const CUSTOM_LANGS = new Set(['mermaid', 'math', 'diff']);

// CommonMark HTML block type 6 (which <details> triggers) ends only at a blank line,
// so any markdown between <summary> and </details> is captured as raw HTML and never
// tokenized. GitHub's renderer is more lenient — it recovers when authors omit the
// blank lines. Inject those blanks here; track a line map so source-line annotations
// still point at the user's original line numbers (for scroll-sync).
export function preprocessDetails(markdown: string): { processed: string; lineMap: number[] } {
  const lines = markdown.split('\n');
  const out: string[] = [];
  const lineMap: number[] = [];
  let depth = 0;

  const isOpen = (s: string) => /^[ \t]*<details(?:\s[^>]*)?>\s*$/.test(s);
  const isClose = (s: string) => /^[ \t]*<\/details>\s*$/.test(s);
  const hasSummaryClose = (s: string) => /<\/summary>/.test(s);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const orig = i + 1;

    if (isClose(line) && depth > 0) {
      if (out.length > 0 && out[out.length - 1].trim() !== '') {
        out.push('');
        lineMap.push(orig);
      }
      out.push(line);
      lineMap.push(orig);
      depth--;
      continue;
    }

    if (isOpen(line)) depth++;

    out.push(line);
    lineMap.push(orig);

    if (depth > 0 && hasSummaryClose(line)) {
      const next = lines[i + 1];
      if (next !== undefined && next.trim() !== '' && !isClose(next)) {
        out.push('');
        lineMap.push(orig + 1);
      }
    }
  }

  return { processed: out.join('\n'), lineMap };
}

export function createMarked(markdown: string): Marked {
  const { processed, lineMap } = preprocessDetails(markdown);
  const marked = new Marked();
  marked.use({ extensions: [createFrontmatterExtension(), ...createMathExtensions()] });
  marked.use(markedAlert());
  marked.use(markedFootnote());
  marked.use(markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && !CUSTOM_LANGS.has(lang) && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return code;
    }
  }));
  marked.use(markedEmoji({ emojis: emojiMap }));
  // Match GFM autolink rules: only http(s)://, www., ftp://, mailto: get linked.
  // fuzzyLink:false stops linkify-it from reading "abc.md" as a Moldova domain.
  marked.use(markedLinkifyIt({}, { fuzzyLink: false }));
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
  marked.use(sourceLines(processed, lineMap));
  applySourceLineWrappers(marked);

  // Force parse() to use the preprocessed source so callers can keep the
  // existing `createMarked(md).parse(md)` shape without leaking the rewrite.
  const origParse = marked.parse.bind(marked);
  marked.parse = ((_input: string, options?: unknown) =>
    origParse(processed, options as never)) as typeof marked.parse;

  return marked;
}
