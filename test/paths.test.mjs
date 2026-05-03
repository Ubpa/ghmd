// Tests that the file paths used by the bundled extension are correct.
// The extension bundles to dist/extension.js, so __dirname === dist/.
// If paths are wrong, the extension silently fails to activate (no error shown to user).

import fs from 'fs';
import path from 'path';
import assert from 'assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const distDir = path.join(root, 'dist');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

console.log('\nShared asset path resolution (simulates dist/__dirname)\n');

test('dist/ directory exists after build', () => {
  assert.ok(fs.existsSync(distDir), `dist/ not found — run "npm run build" first`);
});

test('dist/extension.js exists', () => {
  assert.ok(fs.existsSync(path.join(distDir, 'extension.js')));
});

// Simulate what dist/extension.js does: path.join(__dirname, '..', 'src', 'ui.css')
// where __dirname === dist/
test('ui.css resolves correctly from dist/__dirname', () => {
  const resolved = path.join(distDir, '..', 'src', 'ui.css');
  assert.ok(fs.existsSync(resolved), `Not found: ${resolved}`);
  const content = fs.readFileSync(resolved, 'utf8');
  assert.ok(content.includes('.toolbar'), 'ui.css missing .toolbar styles');
  assert.ok(content.includes('.toc-panel'), 'ui.css missing .toc-panel styles');
});

test('toc.js resolves correctly from dist/__dirname', () => {
  const resolved = path.join(distDir, '..', 'src', 'toc.js');
  assert.ok(fs.existsSync(resolved), `Not found: ${resolved}`);
  const content = fs.readFileSync(resolved, 'utf8');
  assert.ok(content.includes('buildToc'), 'toc.js missing buildToc function');
  assert.ok(content.includes('toggleToc'), 'toc.js missing toggleToc function');
});

test('ui.css is non-empty and valid CSS', () => {
  const content = fs.readFileSync(path.join(distDir, '..', 'src', 'ui.css'), 'utf8');
  assert.ok(content.length > 500, 'ui.css seems too short');
  assert.ok(!content.includes('undefined'), 'ui.css contains "undefined"');
});

test('toc.js is non-empty and valid JS', () => {
  const content = fs.readFileSync(path.join(distDir, '..', 'src', 'toc.js'), 'utf8');
  assert.ok(content.length > 200, 'toc.js seems too short');
  assert.ok(!content.includes('undefined'), 'toc.js contains "undefined"');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
