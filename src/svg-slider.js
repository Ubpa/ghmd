// Per-mermaid-SVG width slider (inlined into both server and VS Code extension).
// 100% = the SVG's intrinsic width from viewBox, NOT the mermaid auto-fit width.
// Mermaid renders large diagrams with width="100%" which shrinks them to fit the
// container; without this the slider's "100%" would lock to that shrunken size,
// so users could never zoom to a readable natural size.

function clampPct(pct) {
  return Math.max(20, Math.min(300, pct));
}

function getSvgBaseWidth(svg) {
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.replace(/,/g, ' ').trim().split(/\s+/).map(parseFloat);
    if (parts.length === 4 && parts[2] > 0 && Number.isFinite(parts[2])) return parts[2];
  }
  return svg.getBoundingClientRect().width;
}

// eslint-disable-next-line no-unused-vars
function addSvgSliders(root) {
  (root || document).querySelectorAll('pre.mermaid svg').forEach(svg => {
    if (svg._hasSlider) return;
    svg._hasSlider = true;
    const pre = svg.closest('pre');
    if (!svg.getAttribute('viewBox')) return;
    const baseWidth = getSvgBaseWidth(svg);
    if (!baseWidth) return;

    const wrap = document.createElement('div');
    wrap.className = 'mermaid-wrap';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);

    const bar = document.createElement('div');
    bar.className = 'svg-slider';
    bar.innerHTML = '<button class="zoom-btn svg-minus">−</button>'
      + '<input type="range" min="20" max="300" value="100">'
      + '<button class="zoom-btn svg-plus">+</button>'
      + '<button class="zoom-btn svg-reset">↺</button>'
      + '<span>100%</span>';
    wrap.insertBefore(bar, pre);

    const slider = bar.querySelector('input');
    const label = bar.querySelector('span');
    let svgHideTimer = null;
    function showSlider() { bar.classList.add('visible'); clearTimeout(svgHideTimer); }
    function hideSlider() { svgHideTimer = setTimeout(() => bar.classList.remove('visible'), 500); }
    wrap.addEventListener('mouseenter', showSlider);
    wrap.addEventListener('mouseleave', hideSlider);
    bar.addEventListener('mouseenter', showSlider);
    bar.addEventListener('mouseleave', hideSlider);

    // Apply baseWidth at init so 100% matches the visible SVG immediately.
    // Otherwise mermaid's width="100%" auto-fit causes a jump on first slider move.
    svg.style.maxWidth = 'none';
    svg.style.width = baseWidth + 'px';

    function setSvgWidth(pct) {
      pct = clampPct(pct);
      slider.value = pct;
      label.textContent = pct + '%';
      const oldRect = svg.getBoundingClientRect();
      const preMidX = pre.getBoundingClientRect().left + pre.clientWidth / 2;
      const viewMidY = window.innerHeight / 2;
      const xr = oldRect.width > 0 ? Math.max(0, Math.min(1, (preMidX - oldRect.left) / oldRect.width)) : 0.5;
      const yr = oldRect.height > 0 ? Math.max(0, Math.min(1, (viewMidY - oldRect.top) / oldRect.height)) : 0.5;
      svg.style.width = (baseWidth * pct / 100) + 'px';
      svg.style.maxWidth = 'none';
      const newRect = svg.getBoundingClientRect();
      pre.scrollLeft += (newRect.left + xr * newRect.width) - preMidX;
      const dy = (newRect.top + yr * newRect.height) - viewMidY;
      if (Math.abs(dy) > 1) window.scrollBy(0, dy);
    }
    slider.addEventListener('input', () => setSvgWidth(parseInt(slider.value)));
    bar.querySelector('.svg-minus').addEventListener('click', () => setSvgWidth(parseInt(slider.value) - 10));
    bar.querySelector('.svg-plus').addEventListener('click', () => setSvgWidth(parseInt(slider.value) + 10));
    bar.querySelector('.svg-reset').addEventListener('click', () => setSvgWidth(100));
  });
}
