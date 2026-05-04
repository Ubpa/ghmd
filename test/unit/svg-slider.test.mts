import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const extSrc = fs.readFileSync(path.resolve('src/extension.ts'), 'utf8');
const uiCss = fs.readFileSync(path.resolve('src/ui.css'), 'utf8');

// --- SVG slider: 100% continuity ---

console.log('test: zoom uses getBoundingClientRect baseWidth, not viewBox intrinsicW');
{
  assert.ok(
    extSrc.includes('getBoundingClientRect().width'),
    'should capture actual rendered width via getBoundingClientRect'
  );
  assert.ok(
    extSrc.includes('baseWidth * pct / 100'),
    'setSvgWidth should scale from baseWidth (actual rendered size)'
  );
  assert.ok(
    !extSrc.includes('intrinsicW * pct / 100'),
    'should NOT use intrinsicW (viewBox width) for zoom calculation'
  );
}

console.log('test: no special case for 100%');
{
  // The old code had: if (pct === 100) { svg.style.width = ''; ... }
  assert.ok(
    !extSrc.includes("pct === 100"),
    'should not special-case 100% — uniform formula for all zoom levels'
  );
}

// --- SVG slider: sticky positioning ---

console.log('test: slider uses position:sticky in CSS');
{
  assert.ok(
    uiCss.includes('position: sticky'),
    '.svg-slider should use position: sticky'
  );
  assert.ok(
    !uiCss.includes('.mermaid-wrap:hover .svg-slider'),
    'should NOT use CSS :hover (use JS .visible class instead for sticky gap bridging)'
  );
  assert.ok(
    uiCss.includes('.svg-slider.visible'),
    'should use .visible class for show/hide'
  );
}

console.log('test: slider inserted before pre (required for sticky top behavior)');
{
  assert.ok(
    extSrc.includes('wrap.insertBefore(bar, pre)'),
    'slider bar must be inserted before pre in DOM order'
  );
  assert.ok(
    !extSrc.includes('wrap.appendChild(bar)'),
    'should NOT appendChild(bar) — that puts slider after pre'
  );
}

console.log('test: center-anchored zoom adjusts scroll after resize');
{
  assert.ok(
    extSrc.includes('pre.scrollLeft +='),
    'should adjust horizontal scroll to keep center stable'
  );
  assert.ok(
    extSrc.includes('window.scrollBy'),
    'should adjust vertical scroll to keep center stable'
  );
}

console.log('test: JS-based show/hide with timeout for sticky gap bridging');
{
  assert.ok(
    extSrc.includes('mouseenter') && extSrc.includes('mouseleave'),
    'should use mouseenter/mouseleave for slider visibility'
  );
  assert.ok(
    extSrc.includes("bar.classList.add('visible')"),
    'should add visible class on hover'
  );
}

console.log('all SVG slider tests passed ✓');
