// Per-mermaid-SVG width slider (inlined into both server and VS Code extension).
//
// Default behavior: clamped auto-fit. Mermaid renders SVGs with width="100%"
// and inline max-width=intrinsic, which means the diagram shrinks to fit its
// container. We add a min-width = baseWidth * MIN_RATIO so the diagram cannot
// shrink below that fraction of intrinsic — heavy compression (e.g. wide gantt
// in a narrow pane) hits the floor and overflows into horizontal scroll, while
// modestly-sized flowcharts still fit naturally inside narrower panes.
//
// 100% on the slider == intrinsic viewBox width (natural readable size).
// Slider initial reflects the actually-rendered ratio so its label matches
// what the user sees. Reset clears slider overrides and returns to clamped
// auto-fit.

const MIN_RATIO = 0.5;

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

function getInitialPct(intrinsic, rendered) {
  if (!intrinsic || !rendered) return 100;
  return clampPct(Math.round(rendered / intrinsic * 100));
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

    // Floor: SVG can't shrink below MIN_RATIO of intrinsic. Below that it
    // overflows the container and the user gets horizontal scroll instead of
    // an illegibly-squished diagram.
    svg.style.minWidth = (baseWidth * MIN_RATIO) + 'px';

    const initialPct = getInitialPct(baseWidth, svg.getBoundingClientRect().width);

    const wrap = document.createElement('div');
    wrap.className = 'mermaid-wrap';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);

    const bar = document.createElement('div');
    bar.className = 'svg-slider';
    bar.innerHTML = '<button class="zoom-btn svg-minus">−</button>'
      + '<input type="range" min="20" max="300">'
      + '<button class="zoom-btn svg-plus">+</button>'
      + '<button class="zoom-btn svg-reset">↺</button>'
      + '<span></span>';
    wrap.insertBefore(bar, pre);

    const slider = bar.querySelector('input');
    const label = bar.querySelector('span');
    slider.value = initialPct;
    label.textContent = initialPct + '%';

    let svgHideTimer = null;
    function showSlider() { bar.classList.add('visible'); clearTimeout(svgHideTimer); }
    function hideSlider() { svgHideTimer = setTimeout(() => bar.classList.remove('visible'), 500); }
    wrap.addEventListener('mouseenter', showSlider);
    wrap.addEventListener('mouseleave', hideSlider);
    bar.addEventListener('mouseenter', showSlider);
    bar.addEventListener('mouseleave', hideSlider);

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
    function resetToInitial() {
      // Drop slider overrides so mermaid's auto-fit (clamped by minWidth) returns.
      svg.style.width = '';
      svg.style.maxWidth = '';
      const restoredPct = getInitialPct(baseWidth, svg.getBoundingClientRect().width);
      slider.value = restoredPct;
      label.textContent = restoredPct + '%';
    }
    slider.addEventListener('input', () => setSvgWidth(parseInt(slider.value)));
    bar.querySelector('.svg-minus').addEventListener('click', () => setSvgWidth(parseInt(slider.value) - 10));
    bar.querySelector('.svg-plus').addEventListener('click', () => setSvgWidth(parseInt(slider.value) + 10));
    bar.querySelector('.svg-reset').addEventListener('click', resetToInitial);
  });
}
