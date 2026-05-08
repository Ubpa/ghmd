import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const tocJs = fs.readFileSync(path.resolve('src/toc.js'), 'utf8');

// Expose pure render helper without a DOM. toc.js defines `renderTocNodes`
// at module scope; appending a return statement lets us pull it out.
const stubDocument = { addEventListener() {} };
const { renderTocNodes } = new Function(
  'document',
  tocJs + '\nreturn { renderTocNodes };'
)(stubDocument);

// --- inline markup in heading text must survive into the TOC link ---

console.log('test: TOC link preserves <code> from heading inline HTML');
{
  const items = [
    { level: 2, id: 'immediateitem-push-constants', text: 'ImmediateItem —— Push Constants', html: '<code>ImmediateItem</code> —— Push Constants', children: [] },
  ];
  const html = renderTocNodes(items, 0);
  assert.ok(html.includes('<code>ImmediateItem</code>'),
    `expected <code> in TOC link, got: ${html}`);
  assert.ok(!html.match(/>`/), 'no raw backticks in rendered TOC');
}

console.log('test: TOC link title attribute is plain text (no markup)');
{
  const items = [
    { level: 2, id: 'x', text: 'foo bar', html: '<code>foo</code> bar', children: [] },
  ];
  const html = renderTocNodes(items, 0);
  const m = html.match(/title="([^"]*)"/);
  assert.ok(m, 'should have title attribute');
  assert.ok(!m![1].includes('<'), `title must be plain text, got: ${m![1]}`);
  assert.ok(m![1].includes('foo bar'), 'title should contain plain text');
}

console.log('test: TOC nests children with html-aware links');
{
  const items = [
    {
      level: 2, id: 'a', text: 'A', html: 'A',
      children: [
        { level: 3, id: 'b', text: 'B sub', html: '<code>B</code> sub', children: [] },
      ],
    },
  ];
  const html = renderTocNodes(items, 0);
  assert.ok(html.includes('<code>B</code> sub'), 'nested link uses html');
}

console.log('all TOC tests passed ✓');
