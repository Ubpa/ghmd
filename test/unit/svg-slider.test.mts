import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sliderJs = fs.readFileSync(path.resolve('src/svg-slider.js'), 'utf8');
const extSrc = fs.readFileSync(path.resolve('src/extension.ts'), 'utf8');
const serveSrc = fs.readFileSync(path.resolve('src/serve.mts'), 'utf8');
const uiCss = fs.readFileSync(path.resolve('src/ui.css'), 'utf8');

// Load the pure helpers from svg-slider.js without a real browser DOM.
// The module defines top-level helpers that we expose through new Function().
const { getSvgBaseWidth, clampPct } = new Function(
  sliderJs + '\nreturn { getSvgBaseWidth, clampPct };'
)();

// --- baseWidth must be the SVG's intrinsic width (the bug we're fixing) ---

console.log('test: getSvgBaseWidth returns viewBox intrinsic width for large diagrams');
{
  // The user's bug: mermaid renders a 2725px-wide diagram via width="100%"
  // shrunken to ~700px in the container. baseWidth must be 2725 (intrinsic),
  // not the shrunken rendered width — otherwise slider 100% is illegible.
  const svg = {
    getAttribute: (name: string) => name === 'viewBox' ? '0 0 2725.46875 654' : null,
    getBoundingClientRect: () => ({ width: 694, height: 167 }),
  };
  assert.equal(
    getSvgBaseWidth(svg), 2725.46875,
    'baseWidth should be intrinsic viewBox width, not the auto-fit rendered width'
  );
}

console.log('test: getSvgBaseWidth handles small diagrams (intrinsic <= rendered)');
{
  // Small diagram: intrinsic 400px, rendered 400px (no shrinkage). baseWidth = 400.
  const svg = {
    getAttribute: (name: string) => name === 'viewBox' ? '0 0 400 200' : null,
    getBoundingClientRect: () => ({ width: 400, height: 200 }),
  };
  assert.equal(getSvgBaseWidth(svg), 400);
}

console.log('test: getSvgBaseWidth tolerates extra whitespace and commas in viewBox');
{
  const svg = {
    getAttribute: (name: string) => name === 'viewBox' ? '  0,0  1500 600  ' : null,
    getBoundingClientRect: () => ({ width: 100, height: 50 }),
  };
  assert.equal(getSvgBaseWidth(svg), 1500);
}

console.log('test: getSvgBaseWidth falls back to rendered width if viewBox missing');
{
  const svg = {
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 800, height: 400 }),
  };
  assert.equal(getSvgBaseWidth(svg), 800);
}

console.log('test: clampPct constrains slider value to [20, 300]');
{
  assert.equal(clampPct(0), 20);
  assert.equal(clampPct(10), 20);
  assert.equal(clampPct(20), 20);
  assert.equal(clampPct(100), 100);
  assert.equal(clampPct(300), 300);
  assert.equal(clampPct(500), 300);
}

// --- Slider must apply baseWidth at init so 100% matches the visual ---

console.log('test: slider applies width=baseWidth at init (no jump on first move)');
{
  // After this fix, when the slider is created, the SVG immediately renders at
  // intrinsic size. Without this, slider value 100 doesn't match the current
  // visual (mermaid auto-fit), causing a jarring jump on first slider movement.
  assert.ok(
    sliderJs.includes("svg.style.maxWidth = 'none'") &&
    sliderJs.includes("svg.style.width = baseWidth"),
    "slider init must set svg.style.width = baseWidth and maxWidth = 'none'"
  );
}

// --- Code-sharing: both entry points use the shared module ---

console.log('test: extension.ts and serve.mts both inline src/svg-slider.js');
{
  assert.ok(
    extSrc.includes("svg-slider.js"),
    'extension.ts should read src/svg-slider.js'
  );
  assert.ok(
    serveSrc.includes("svg-slider.js"),
    'serve.mts should read src/svg-slider.js'
  );
  // No more duplicated baseWidth-from-getBoundingClientRect logic in the entry points.
  assert.ok(
    !extSrc.includes('const baseWidth = svg.getBoundingClientRect().width'),
    'extension.ts should not have its own copy of slider logic'
  );
  assert.ok(
    !serveSrc.includes('const baseWidth = svg.getBoundingClientRect().width'),
    'serve.mts should not have its own copy of slider logic'
  );
}

// --- Regressions from prior fix that we still want ---

console.log('test: no special case for 100%');
{
  assert.ok(
    !sliderJs.includes("pct === 100"),
    'should not special-case 100% — uniform formula for all zoom levels'
  );
}

console.log('test: slider uses position:sticky in CSS');
{
  assert.ok(uiCss.includes('position: sticky'), '.svg-slider should use position: sticky');
  assert.ok(
    !uiCss.includes('.mermaid-wrap:hover .svg-slider'),
    'should NOT use CSS :hover (use JS .visible class instead)'
  );
  assert.ok(uiCss.includes('.svg-slider.visible'), 'should use .visible class');
}

console.log('test: slider inserted before pre (required for sticky top behavior)');
{
  assert.ok(
    sliderJs.includes('wrap.insertBefore(bar, pre)'),
    'slider bar must be inserted before pre in DOM order'
  );
  assert.ok(
    !sliderJs.includes('wrap.appendChild(bar)'),
    'should NOT appendChild(bar)'
  );
}

console.log('test: center-anchored zoom adjusts scroll after resize');
{
  assert.ok(sliderJs.includes('pre.scrollLeft +='), 'horizontal scroll adjustment');
  assert.ok(sliderJs.includes('window.scrollBy'), 'vertical scroll adjustment');
}

console.log('test: JS-based show/hide for sticky gap bridging');
{
  assert.ok(
    sliderJs.includes('mouseenter') && sliderJs.includes('mouseleave'),
    'should use mouseenter/mouseleave for slider visibility'
  );
  assert.ok(
    sliderJs.includes("bar.classList.add('visible')"),
    'should add visible class on hover'
  );
}

console.log('all SVG slider tests passed ✓');
