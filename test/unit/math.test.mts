import assert from 'node:assert/strict';
import { Marked } from 'marked';
import markedAlert from 'marked-alert';
import markedFootnote from 'marked-footnote';
import { markedHighlight } from 'marked-highlight';
import { markedEmoji } from 'marked-emoji';
import markedLinkifyIt from 'marked-linkify-it';
import hljs from 'highlight.js';
import { gemoji } from 'gemoji';
import { createFrontmatterExtension } from '../../src/frontmatter.js';
import { createMathExtensions } from '../../src/math.js';

const emojiMap: Record<string, string> = {};
gemoji.forEach(e => e.names.forEach(n => { emojiMap[n] = e.emoji; }));

// Reproduces the full pipeline used by both serve.mts and extension.ts.
function parse(md: string): string {
  const marked = new Marked();
  marked.use({ extensions: [createFrontmatterExtension(), ...createMathExtensions()] });
  marked.use(markedAlert());
  marked.use(markedFootnote());
  marked.use(markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
      return code;
    },
  }));
  marked.use(markedEmoji({ emojis: emojiMap }));
  marked.use(markedLinkifyIt());
  return marked.parse(md) as string;
}

// --- Display math ($$...$$) preserves raw LaTeX ---

console.log('test: $$ block preserves <T> (HTML-looking tags inside math)');
{
  const html = parse('$$\n\\texttt{TypeID\\_of<T>} = \\text{FNV}(\\texttt{nameof<T>()})\n$$\n');
  assert.ok(html.includes('TypeID'), 'TypeID identifier survives');
  assert.ok(html.includes('nameof'), 'nameof identifier survives');
  // The literal "<T>" must reach the browser intact (HTML-escaped is fine, stripped is not).
  assert.ok(
    html.includes('<T>') || html.includes('&lt;T&gt;'),
    'angle-bracketed <T> must survive markdown parsing'
  );
  assert.ok(
    !/TypeID[^_]of/.test(html.replace(/&lt;|&gt;/g, '')) || html.includes('\\_'),
    'escaped underscore \\_ should not be silently dropped'
  );
}

console.log('test: $$ block preserves backslash-escapes (\\_, \\{, etc.)');
{
  const html = parse('$$ a\\_b\\_c $$\n');
  // KaTeX needs the literal backslash + underscore. After marked, "\_" must not become
  // a bare "_" (which would let downstream emphasis logic eat it).
  assert.ok(html.includes('\\_'), 'backslash-escape must reach the math content');
}

console.log('test: $$ multi-line block round-trips intact');
{
  const md = '$$\nx_1 + x_2 = y\n$$\n';
  const html = parse(md);
  assert.ok(html.includes('x_1'), 'subscript underscores preserved');
  assert.ok(html.includes('x_2'), 'subscript underscores preserved');
  assert.ok(!/<em>/.test(html), 'underscores inside math must not become <em>');
}

// --- Inline math ($...$) ---

console.log('test: inline $...$ preserves angle brackets');
{
  const html = parse('Use $f<g>$ in code.\n');
  assert.ok(
    html.includes('f<g>') || html.includes('f&lt;g&gt;'),
    '<g> inside inline math must survive'
  );
}

console.log('test: inline $...$ does not eat dollar amounts in prose');
{
  // Two unrelated dollars on the same paragraph should not become math.
  const html = parse('It costs $5 and $10 total.\n');
  assert.ok(!html.includes('katex'), 'no math wrapping for prose dollars');
  assert.ok(html.includes('$5'), '$5 stays literal');
  assert.ok(html.includes('$10'), '$10 stays literal');
}

// --- Output shape: KaTeX delimiters preserved for client-side renderer ---

console.log('test: $$ block emits a span/div KaTeX can find');
{
  const html = parse('$$ a + b $$\n');
  // renderMathInElement looks for literal $$...$$ delimiters in text. Whether we keep
  // them or pre-render server-side, the client must see math markup of some kind.
  assert.ok(
    /\$\$[\s\S]*a \+ b[\s\S]*\$\$/.test(html) || html.includes('class="katex'),
    'output must either keep $$ delimiters or contain pre-rendered KaTeX'
  );
}

console.log('all math tests passed ✓');
