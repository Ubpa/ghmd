import assert from 'node:assert/strict';
import { createMarked } from '../../src/render.js';

function render(md: string): string {
  return createMarked(md).parse(md) as string;
}

// --- core complaint: ``` code block inside <details> renders even when blank
//     lines around <summary> / </details> are missing.

console.log('test: fenced code block inside <details> renders WITH blank lines around <summary>');
{
  const md = '<details>\n<summary>title</summary>\n\n```\ncode\n```\n\n</details>\n';
  const html = render(md);
  assert.ok(/<pre[^>]*><code/.test(html), `expected <pre><code>, got: ${html}`);
  assert.ok(html.includes('code'), 'expected code body in output');
  assert.ok(!/```/.test(html), 'must not contain raw triple backticks');
}

console.log('test: fenced code block inside <details> renders WITHOUT blank line after </summary>');
{
  const md = '<details>\n<summary>title</summary>\n```\ncode\n```\n\n</details>\n';
  const html = render(md);
  assert.ok(/<pre[^>]*><code/.test(html), `expected <pre><code>, got: ${html}`);
  assert.ok(!/```/.test(html), 'must not contain raw triple backticks');
}

console.log('test: fenced code block inside <details> renders WITHOUT any blank lines');
{
  const md = '<details>\n<summary>title</summary>\n```\ncode\n```\n</details>\n';
  const html = render(md);
  assert.ok(/<pre[^>]*><code/.test(html), `expected <pre><code>, got: ${html}`);
  assert.ok(!/```/.test(html), 'must not contain raw triple backticks');
}

console.log('test: fenced code block inside <details> renders WITHOUT blank line before </details>');
{
  const md = '<details>\n<summary>title</summary>\n\n```\ncode\n```\n</details>\n';
  const html = render(md);
  assert.ok(/<pre[^>]*><code/.test(html), `expected <pre><code>, got: ${html}`);
  assert.ok(!/```/.test(html), 'must not contain raw triple backticks');
}

console.log('test: language-tagged code block inside <details> still gets hljs class');
{
  const md = '<details>\n<summary>title</summary>\n```js\nconst x = 1;\n```\n</details>\n';
  const html = render(md);
  assert.ok(/class="hljs[^"]*language-js"/.test(html), `expected hljs class, got: ${html}`);
}

console.log('test: <details> structure is preserved (open + close tags, summary intact)');
{
  const md = '<details>\n<summary>title</summary>\n```\ncode\n```\n</details>\n';
  const html = render(md);
  assert.ok(/<details[^>]*>/.test(html), 'must contain <details>');
  assert.ok(html.includes('</details>'), 'must contain </details>');
  assert.ok(html.includes('<summary>title</summary>'), 'summary text must be preserved');
}

console.log('test: user-reported example with backticks-in-summary renders the fenced block');
{
  const md = [
    '<details>',
    '<summary>`node apps/hello-triangle/scripts/ac-08-grep-gate.mjs` exit 0 (verify.json `ac08GrepGateState`)</summary>',
    '',
    '```',
    "(a) plan-strategy '不保留 manual override' x5",
    "(b) '架构原则 #5 Fail Fast' x5",
    "(c) '命题 4' x15",
    '(d) workflows non-comment manual override = 0',
    '(e) ci.yml<->package.json#unveil.smokeInvocation byte-for-byte ✓',
    '(f) skill SSOT skipped (worktree symlink absent, harness repo handles)',
    '全部 6 闸门 PASS',
    '```',
    '',
    '</details>',
    '',
  ].join('\n');
  const html = render(md);
  assert.ok(/<pre[^>]*><code/.test(html), `expected <pre><code>, got: ${html}`);
  assert.ok(html.includes('plan-strategy'), 'code body content present');
  assert.ok(html.includes('全部 6 闸门 PASS'), 'final code line present');
  assert.ok(!/^```/m.test(html), 'must not contain raw triple backticks at line start');
}

console.log('test: nested <details> still parses inner code block');
{
  const md = [
    '<details>',
    '<summary>outer</summary>',
    '<details>',
    '<summary>inner</summary>',
    '```',
    'code',
    '```',
    '</details>',
    '</details>',
    '',
  ].join('\n');
  const html = render(md);
  assert.ok(/<pre[^>]*><code/.test(html), `expected <pre><code>, got: ${html}`);
  const detailsOpen = (html.match(/<details/g) || []).length;
  const detailsClose = (html.match(/<\/details>/g) || []).length;
  assert.equal(detailsOpen, 2, 'two <details> open tags');
  assert.equal(detailsClose, 2, 'two </details> close tags');
}

console.log('all details tests passed ✓');
