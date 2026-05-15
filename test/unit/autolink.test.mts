import assert from 'node:assert/strict';
import { createMarked } from '../../src/render.js';

function render(md: string): string {
  return createMarked(md).parse(md) as string;
}

// Match GFM autolink semantics: bare filenames (abc.md, readme.ts) are NOT URLs
// even though .md/.ts happen to be ccTLDs. linkify-it's fuzzyLink mode confuses
// ".md" (Moldova) with markdown filenames; we want GitHub-style behaviour.

console.log('test: bare abc.md is NOT autolinked');
{
  const html = render('See abc.md for details.\n');
  assert.ok(!/<a [^>]*href="[^"]*abc\.md/.test(html), `abc.md should not be a link, got: ${html}`);
  assert.ok(html.includes('abc.md'), 'abc.md text preserved');
}

console.log('test: bare readme.md is NOT autolinked');
{
  const html = render('Edit readme.md please.\n');
  assert.ok(!/<a [^>]*href=/.test(html), `no <a> tag expected, got: ${html}`);
}

console.log('test: multiple file names in one sentence stay plain');
{
  const html = render('Look at a.md and b.md and c.json.\n');
  assert.ok(!/<a [^>]*href=/.test(html), `no link expected, got: ${html}`);
  assert.ok(html.includes('a.md'));
  assert.ok(html.includes('b.md'));
}

console.log('test: TypeScript filenames (foo.ts) stay plain');
{
  const html = render('Open foo.ts and bar.tsx.\n');
  assert.ok(!/<a [^>]*href=/.test(html), `no link expected, got: ${html}`);
}

// --- regression: real URLs and emails MUST still autolink (GFM autolink rules) ---

console.log('test: https URLs still autolink');
{
  const html = render('Visit https://example.com today.\n');
  assert.ok(/<a [^>]*href="https:\/\/example\.com"/.test(html), `https:// should link, got: ${html}`);
}

console.log('test: www.* URLs still autolink');
{
  const html = render('Visit www.example.com today.\n');
  assert.ok(/<a [^>]*href="http:\/\/www\.example\.com"/.test(html), `www. should link, got: ${html}`);
}

console.log('test: email addresses still autolink');
{
  const html = render('Mail foo@bar.com please.\n');
  assert.ok(/<a [^>]*href="mailto:foo@bar\.com"/.test(html), `email should link, got: ${html}`);
}

console.log('test: explicit markdown link [text](abc.md) still works');
{
  const html = render('[abc.md](./abc.md)\n');
  assert.ok(/<a [^>]*href="\.\/abc\.md"/.test(html), `explicit link should resolve, got: ${html}`);
}

console.log('test: <https://example.com> autolink syntax still works');
{
  const html = render('<https://example.com>\n');
  assert.ok(/<a [^>]*href="https:\/\/example\.com"/.test(html), `angle-bracket URL should link, got: ${html}`);
}

console.log('all autolink tests passed ✓');
