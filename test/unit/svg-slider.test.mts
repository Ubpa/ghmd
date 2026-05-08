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

// --- Initial display: clamped auto-fit (min-width floors max compression) ---

console.log('test: init sets style.minWidth so heavy compression overflows instead');
{
  const initBlock = sliderJs.match(
    /const baseWidth = getSvgBaseWidth[\s\S]*?function setSvgWidth/
  )?.[0] || '';
  assert.ok(
    /svg\.style\.minWidth\s*=/.test(initBlock),
    'init must set svg.style.minWidth so wide diagrams have a readable floor'
  );
  assert.ok(
    /minWidth\s*=[^;]*baseWidth/.test(initBlock),
    'minWidth should be derived from baseWidth (e.g. baseWidth * MIN_RATIO)'
  );
  assert.ok(
    !/svg\.style\.width\s*=/.test(initBlock),
    'init must NOT lock svg.style.width — let mermaid auto-fit work below the cap'
  );
  assert.ok(
    !/svg\.style\.maxWidth\s*=/.test(initBlock),
    "init must NOT clear svg.style.maxWidth — mermaid's inline cap prevents bloat on wide screens"
  );
}

console.log('test: slider initial value reflects rendered/intrinsic ratio');
{
  // With clamped auto-fit, what's actually painted depends on the container,
  // so the slider must re-read the rendered width and translate to a percentage.
  const { getInitialPct } = new Function(
    sliderJs + '\nreturn { getInitialPct };'
  )();
  assert.equal(typeof getInitialPct, 'function', 'getInitialPct helper must exist');
  assert.equal(getInitialPct(2000, 1000), 50, 'half-compressed → 50%');
  assert.equal(getInitialPct(800, 800), 100, 'no compression → 100%');
  assert.equal(getInitialPct(0, 500), 100, 'guard against zero intrinsic');
  assert.equal(getInitialPct(500, 0), 100, 'guard against zero rendered');
  assert.equal(getInitialPct(10000, 100), 20, 'min slider clamp');
  assert.ok(
    sliderJs.includes('slider.value = initialPct') ||
      sliderJs.includes('slider.value=initialPct'),
    'slider value should be set to computed initialPct'
  );
}

console.log('test: reset clears inline width AND maxWidth so auto-fit (clamped by minWidth) returns');
{
  assert.ok(
    sliderJs.includes("svg.style.width = ''"),
    'reset must clear svg.style.width to drop slider override'
  );
  assert.ok(
    sliderJs.includes("svg.style.maxWidth = ''"),
    "reset must also clear svg.style.maxWidth so mermaid's inline cap takes effect again"
  );
  assert.ok(
    !sliderJs.includes('setSvgWidth(100)'),
    'reset must NOT call setSvgWidth(100) — that locks to intrinsic, not auto-fit'
  );
}

console.log('test: ui.css does NOT force max-width:none on mermaid SVG (preserves mermaid cap)');
{
  // mermaid sets style="max-width: <intrinsic>px" inline. We must let that through
  // so SVGs don't bloat past intrinsic on wide screens; slider override is per-zoom.
  assert.ok(
    !/pre\.mermaid\s+svg\s*\{[^}]*max-width:\s*none/.test(uiCss),
    'ui.css should not contain "pre.mermaid svg { max-width: none }" — keeps mermaid intrinsic cap'
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
