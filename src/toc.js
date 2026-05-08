// Shared TOC client-side logic (inlined into both server and VS Code extension)

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTocNodes(nodes, indent, state) {
  state = state || { uid: 0 };
  return nodes.map(n => {
    const hasKids = n.children.length > 0;
    const tid = 'tc' + (state.uid++);
    const link = n.id ? '<a class="h' + n.level + '" href="#' + n.id + '" title="' + escAttr(n.text) + '">' + n.html + '</a>' : '';
    const collapsed = hasKids && n.level >= 2;
    const kidsHtml = hasKids ? '<div class="toc-children" id="' + tid + '"' + (collapsed ? ' style="display:none"' : '') + '>' + renderTocNodes(n.children, indent + 8, state) + '</div>' : '';
    const arrowHtml = hasKids ? '<button class="toc-arrow" data-target="' + tid + '">' + (collapsed ? '▸' : '▾') + '</button>' : '<span class="toc-spacer"></span>';
    return '<div><div class="toc-row" style="padding-left:' + indent + 'px">' + arrowHtml + link + '</div>' + kidsHtml + '</div>';
  }).join('');
}

function buildToc() {
  let hs = Array.from(document.querySelectorAll('.ghmd-wrapper h1,.ghmd-wrapper h2,.ghmd-wrapper h3,.ghmd-wrapper h4,.ghmd-wrapper h5,.ghmd-wrapper h6'));
  const panel = document.getElementById('tocPanel');
  if (!hs.length) { document.getElementById('tocBtn').style.display = 'none'; return; }
  // Skip the lone h1 (document title) so h2+ starts at top indent level
  const h1s = hs.filter(h => h.tagName === 'H1');
  if (h1s.length === 1) hs = hs.filter(h => h.tagName !== 'H1');
  if (!hs.length) { document.getElementById('tocBtn').style.display = 'none'; return; }
  const items = hs.map(h => ({ level: parseInt(h.tagName[1]), id: h.id, text: h.textContent.trim(), html: h.innerHTML.trim(), children: [] }));
  const root = { level: 0, children: [] };
  const stack = [root];
  for (const item of items) {
    while (stack.length > 1 && stack[stack.length - 1].level >= item.level) stack.pop();
    stack[stack.length - 1].children.push(item);
    stack.push(item);
  }
  panel.innerHTML = renderTocNodes(root.children, 2);
  panel.querySelectorAll('.toc-arrow').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const kids = document.getElementById(btn.dataset.target);
    const open = kids.style.display === 'none';
    kids.style.display = open ? '' : 'none';
    btn.textContent = open ? '▾' : '▸';
  }));
  panel.querySelectorAll('a').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById(a.getAttribute('href').slice(1))?.scrollIntoView({ behavior: 'smooth' });
    const row = a.closest('.toc-row');
    if (row) {
      const btn = row.querySelector('.toc-arrow');
      if (btn) {
        const kids = document.getElementById(btn.dataset.target);
        if (kids && kids.style.display === 'none') {
          kids.style.display = '';
          btn.textContent = '▾';
        }
      }
    }
  }));
}

function toggleToc() { document.getElementById('tocPanel').classList.toggle('open'); }

document.addEventListener('click', e => {
  if (!e.target.closest('#tocPanel') && !e.target.closest('#tocBtn')) {
    document.getElementById('tocPanel').classList.remove('open');
  }
});
