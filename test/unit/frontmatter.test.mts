import assert from 'node:assert/strict';
import { Marked } from 'marked';
import { createFrontmatterExtension } from '../../src/frontmatter.js';

function parse(md: string): string {
  const marked = new Marked();
  marked.use({ extensions: [createFrontmatterExtension()] });
  return marked.parse(md) as string;
}

// --- Frontmatter: valid ---

console.log('test: valid frontmatter renders as table');
{
  const html = parse(`---\ntitle: Hello\ntags: a, b\n---\n\n## Content\n`);
  assert.ok(html.includes('<table>'), 'should contain table');
  assert.ok(html.includes('Hello'), 'should contain frontmatter value');
  assert.ok(html.includes('<h2'), 'content after frontmatter should be visible');
}

// --- Frontmatter: false positive (the actual bug) ---

console.log('test: horizontal rules are NOT eaten as frontmatter');
{
  const html = parse(`# Title\n\n---\n\n## Section A\n\nContent A.\n\n---\n\n## Section B\n`);
  assert.ok(!html.includes('<table>'), 'no false frontmatter table');
  assert.ok(html.includes('Section A'), 'Section A must be visible');
  assert.ok(html.includes('Content A'), 'Content A must be visible');
  assert.ok(html.includes('Section B'), 'Section B must be visible');
  assert.ok((html.match(/<hr/g) || []).length >= 2, 'should have at least 2 <hr> tags');
}

console.log('test: --- only treated as frontmatter at document start');
{
  const html = parse(`Some text\n\n---\nkey: value\n---\n\n## After\n`);
  assert.ok(!html.includes('<table>'), 'mid-document --- should not become frontmatter');
  assert.ok(html.includes('After'), 'content after --- should be visible');
}

console.log('test: frontmatter extension is per-instance (no state leak)');
{
  const html1 = parse(`---\ntitle: First\n---\n\n## A\n`);
  const html2 = parse(`# No FM\n\n---\n\n## B\n`);
  assert.ok(html1.includes('<table>'), 'first doc should have frontmatter');
  assert.ok(!html2.includes('<table>'), 'second doc should not have false frontmatter');
  assert.ok(html2.includes('B'), 'second doc section B must be visible');
}

// --- Frontmatter: inline markdown in values ---

console.log('test: inline code in YAML string values renders as <code>');
{
  const html = parse(`---\nsummary: "the \`Id<Marker>\` type is 64-bit"\n---\n\n# X\n`);
  assert.ok(html.includes('<code>'), 'should render backticks as <code>');
  assert.ok(html.includes('Id&lt;Marker&gt;'), 'angle brackets inside code stay escaped');
  assert.ok(!html.match(/`Id/), 'no raw backticks should remain');
}

console.log('test: inline code inside YAML array values renders as <code>');
{
  const html = parse(`---\ntags: ["\`foo\`", bar]\n---\n\n# X\n`);
  assert.ok(html.includes('<code>foo</code>'), 'backticks inside array string should render');
  assert.ok(html.includes('bar'), 'plain array items still render');
}

console.log('test: links and emphasis in YAML values render as inline markdown');
{
  const html = parse(`---\nurl: "[wgpu](https://example.com)"\nnote: "*important*"\n---\n\n# X\n`);
  assert.ok(html.includes('<a href="https://example.com"'), 'inline link should render');
  assert.ok(html.includes('<em>important</em>'), 'inline emphasis should render');
}

console.log('test: plain YAML strings without markdown still escape HTML');
{
  const html = parse(`---\ntitle: "<script>alert(1)</script>"\n---\n\n# X\n`);
  assert.ok(!html.includes('<script>'), 'raw HTML must remain escaped');
  assert.ok(html.includes('&lt;script&gt;') || html.includes('alert(1)'), 'should be escaped');
}

console.log('all frontmatter tests passed ✓');
