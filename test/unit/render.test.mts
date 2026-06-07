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

// --- frontmatter must not swallow body content (regression) ---
// Bug: the frontmatter tokenizer fired on ANY document whose first line was
// `---`, greedily consuming everything up to the next `---`. When that span
// wasn't a valid YAML mapping, the renderer returned '' and the body vanished.

console.log('test: real frontmatter at doc start renders as a table');
{
  const html = render(`---\ntitle: Hello\ntags: a, b\n---\n\n## Body\n`);
  assert.ok(html.includes('<table>'), 'valid YAML mapping should become a table');
  assert.ok(html.includes('Hello'), 'frontmatter value visible');
  assert.ok(html.includes('Body'), 'content after frontmatter visible');
}

console.log('test: leading --- with non-mapping body does NOT eat the text');
{
  // `---\n这是正文\n---` — "这是正文" is a YAML scalar, not a mapping.
  const html = render(`---\n这是正文\n---\n\n后续\n`);
  assert.ok(html.includes('这是正文'), 'scalar body must remain visible, not be swallowed');
  assert.ok(html.includes('后续'), 'trailing content must remain visible');
  assert.ok(!html.includes('<table>'), 'a non-mapping must not become a frontmatter table');
}

console.log('test: leading thematic break is not consumed as frontmatter');
{
  const html = render(`---\n\n正文一\n\n---\n\n正文二\n`);
  assert.ok(html.includes('正文一'), 'first body paragraph must survive');
  assert.ok(html.includes('正文二'), 'second body paragraph must survive');
  assert.ok(!html.includes('<table>'), 'no false frontmatter table');
}

console.log('test: body --- ... --- (not at doc start) is untouched by frontmatter');
{
  const html = render(`# Title\n\nIntro.\n\n---\nkey: value\n---\n\n## After\n`);
  assert.ok(html.includes('Title') && html.includes('After'), 'headings survive');
  assert.ok(!html.includes('<table>'), 'mid-document --- must not become frontmatter');
}

console.log('all render tests passed ✓');
