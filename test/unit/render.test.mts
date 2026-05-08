import assert from 'node:assert/strict';
import { createMarked } from '../../src/render.js';

function render(md: string): string {
  return createMarked(md).parse(md) as string;
}

// --- diff code block: custom renderer must win over markedHighlight (bug fix) ---

console.log('test: ```diff blocks render with diff-add / diff-del spans');
{
  const html = render('```diff\n+added\n-removed\n same\n```\n');
  assert.ok(
    html.includes('<span class="diff-add">+added</span>'),
    `expected <span class="diff-add">+added</span>, got: ${html}`
  );
  assert.ok(
    html.includes('<span class="diff-del">-removed</span>'),
    `expected <span class="diff-del">-removed</span>, got: ${html}`
  );
  assert.ok(
    html.includes('<span> same</span>'),
    `expected default span for context line, got: ${html}`
  );
}

console.log('test: ```diff is NOT pre-mangled by hljs (no escaped hljs spans)');
{
  const html = render('```diff\n+a\n-b\n```\n');
  assert.ok(
    !html.includes('hljs-addition'),
    'must not contain hljs-addition class — markedHighlight should skip diff'
  );
  assert.ok(
    !html.includes('&lt;span class='),
    'must not contain double-escaped <span> from hljs-then-escHtml chain'
  );
}

// --- regression guards: known-language code blocks still get hljs ---

console.log('test: ```js still gets hljs highlighting (markedHighlight not broken)');
{
  const html = render('```js\nconst x = 1;\n```\n');
  assert.ok(/class="hljs[^"]*language-js"/.test(html), 'js block should have hljs classes');
}

// --- regression guards: mermaid and math blocks unchanged ---

console.log('test: ```mermaid renders as <pre class="mermaid"> with raw source');
{
  const html = render('```mermaid\nflowchart TD\n  A --> B\n```\n');
  assert.ok(/<pre[^>]*class="mermaid"/.test(html), 'mermaid <pre> present');
  assert.ok(html.includes('flowchart TD'), 'mermaid source preserved');
  assert.ok(html.includes('A --&gt; B'), 'mermaid source HTML-escaped (--> not as tag)');
  assert.ok(!html.includes('hljs'), 'mermaid block must not be hljs-highlighted');
}

console.log('test: ```math renders as <div class="math-block"> with $$ delimiters');
{
  const html = render('```math\na^2 + b^2 = c^2\n```\n');
  assert.ok(/<div[^>]*class="math-block"[^>]*>\$\$/.test(html), 'math block opens with $$');
  assert.ok(html.includes('a^2 + b^2 = c^2$$</div>'), 'math source preserved and closes with $$');
}

console.log('all render tests passed ✓');
