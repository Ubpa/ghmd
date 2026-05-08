import assert from 'node:assert/strict';
import { Marked } from 'marked';
import { slugify, createHeadingRenderer } from '../../src/heading.js';

function parse(md: string): string {
  const marked = new Marked();
  marked.use(createHeadingRenderer());
  return marked.parse(md) as string;
}

function extractIds(html: string): string[] {
  return Array.from(html.matchAll(/<h\d[^>]*\sid="([^"]*)"/g)).map(m => m[1]);
}

// --- slugify (pure text) keeps existing behavior ---

console.log('test: slugify produces same slug for same text (pure function)');
{
  assert.equal(slugify('核心观点'), slugify('核心观点'));
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('  Mixed  CASE  '), 'mixed-case');
}

// --- dedup: the actual bug ---

console.log('test: duplicate headings get unique ids in render order (GitHub style)');
{
  const html = parse('# 核心观点\n# 核心观点\n# 其他\n# 核心观点\n');
  const ids = extractIds(html);
  assert.deepEqual(ids, ['核心观点', '核心观点-1', '其他', '核心观点-2'],
    `got ids ${JSON.stringify(ids)}`);
}

console.log('test: ASCII duplicates get suffix too');
{
  const html = parse('## Overview\n## Overview\n## Details\n## Overview\n');
  const ids = extractIds(html);
  assert.deepEqual(ids, ['overview', 'overview-1', 'details', 'overview-2']);
}

console.log('test: counter resets per parse (no state leak across documents)');
{
  const marked = new Marked();
  marked.use(createHeadingRenderer());
  const html1 = marked.parse('# 同名\n# 同名\n') as string;
  const html2 = marked.parse('# 同名\n# 同名\n') as string;
  assert.deepEqual(extractIds(html1), ['同名', '同名-1']);
  assert.deepEqual(extractIds(html2), ['同名', '同名-1'],
    'counter must reset between parses');
}

console.log('test: single occurrence keeps unsuffixed id (no behavior change for unique titles)');
{
  const html = parse('# 唯一\n## 仅一次\n');
  const ids = extractIds(html);
  assert.deepEqual(ids, ['唯一', '仅一次']);
}

// --- Inline markdown inside heading text ---

console.log('test: backtick code in heading renders as <code>');
{
  const html = parse('# `ImmediateItem` —— Push Constants 模拟\n');
  assert.ok(html.includes('<code>ImmediateItem</code>'),
    `expected <code> in heading, got: ${html}`);
  assert.ok(!html.match(/<h1[^>]*>`/), 'no raw backticks should remain in heading');
}

console.log('test: heading id strips inline code markup but keeps the text');
{
  const html = parse('# `ImmediateItem` —— Push Constants 模拟\n');
  const ids = extractIds(html);
  assert.equal(ids.length, 1);
  assert.ok(ids[0].includes('immediateitem'),
    `id should contain identifier text, got: ${ids[0]}`);
  assert.ok(!ids[0].includes('`'), 'id must not contain backticks');
}

console.log('test: emphasis and links inside headings render as inline markdown');
{
  const html = parse('## *bold* and [link](https://x.test)\n');
  assert.ok(html.includes('<em>bold</em>'), 'emphasis should render');
  assert.ok(html.includes('<a href="https://x.test"'), 'link should render');
}

console.log('all heading-anchors tests passed ✓');
