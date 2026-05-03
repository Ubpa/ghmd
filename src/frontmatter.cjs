// Marked extension: renders YAML front matter as a key-value <table>, matching GitHub's behavior.
// Unlike the npm `marked-frontmatter` package (which needs client-side post-processing via
// renderFrontmatterBlocks()), this renders the table server-side in one pass.
const yaml = require('js-yaml');

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatValue(val) {
  if (Array.isArray(val)) return escHtml(val.join(', '));
  if (val && typeof val === 'object') return escHtml(JSON.stringify(val));
  return escHtml(val);
}

const frontmatterExtension = {
  name: 'frontmatter',
  level: 'block',
  start(src) {
    return src.match(/^---\s*\n/)?.index;
  },
  tokenizer(src) {
    const match = src.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
    if (!match) return;
    return { type: 'frontmatter', raw: match[0], text: match[1] };
  },
  renderer(token) {
    let data;
    try { data = yaml.load(token.text); } catch { return ''; }
    if (!data || typeof data !== 'object') return '';
    const rows = Object.entries(data).map(([k, v]) =>
      `<tr><th>${escHtml(k)}</th><td>${formatValue(v)}</td></tr>`
    ).join('');
    return `<table>${rows}</table>\n`;
  }
};

module.exports = { frontmatterExtension };
