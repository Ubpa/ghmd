# ghmd — GitHub Markdown Preview

**Pixel-perfect GitHub rendering, locally.** Works as a standalone server (browser) and a VS Code extension.

![Version](https://img.shields.io/badge/version-0.1.1-blue) ![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?logo=node.js) ![License](https://img.shields.io/badge/license-MIT-green) ![Size](https://img.shields.io/badge/vsix-~420KB-blue)

---

## Why GHMD?

| | GHMD | Built-in Preview | MPE |
|---|:---:|:---:|:---:|
| GitHub-accurate rendering | Yes | No | Approximate |
| Alerts, footnotes, math, mermaid | All | None | All |
| Install size | ~420 KB | Built-in | ~50 MB |
| Config required | Zero | Zero | Extensive |
| Standalone server | Yes | No | No |

---

## Features

| Feature | Syntax |
|---------|--------|
| GitHub Alerts | `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]` |
| Mermaid diagrams | ` ```mermaid ` (flowchart, sequence, gantt, class, state, ER, pie, git) |
| LaTeX math | `$...$` inline, `$$...$$` block |
| Code highlighting | ` ```lang ` via marked-highlight + highlight.js |
| Diff highlighting | ` ```diff ` with `+`/`-` lines |
| Collapsible sections | `<details>` / `<summary>` |
| Footnotes | `[^label]` |
| YAML front matter | `---` metadata rendered as table |
| Emoji shortcodes | `:sparkles:` → ✨ (full GitHub set via gemoji) |
| Auto-linked URLs | Bare URLs become clickable links |
| Task lists | `- [x]` / `- [ ]` |
| Keyboard keys | `<kbd>Cmd</kbd>` |
| Sub/superscript | `<sub>` / `<sup>` |
| Theme-aware images | `<picture>` with `prefers-color-scheme` |
| Light/dark toggle | Toolbar button, persisted |
| Table of contents | Collapsible TOC panel |
| Live reload | Auto-updates on file change |

---

## Install

```bash
git clone git@github.com:Ubpa/ghmd.git
cd ghmd
npm install
```

---

## Usage

### Standalone Server

```bash
node serve.mjs README.md              # http://localhost:6419
node serve.mjs docs/guide.md 8080     # custom port
```

Auto-reloads in browser on file change. KaTeX and Mermaid load from CDN.

<details>
<summary>Offline mode</summary>

```bash
node serve.mjs --init                  # one-time: downloads katex + mermaid
node serve.mjs README.md              # now fully offline
```

</details>

### VS Code Extension

#### Install

```bash
npm run package                        # build + create .vsix
code --install-extension ghmd-*.vsix --extensions-dir ~/.vscode/extensions
```

> [!WARNING]
> The `code` CLI may install to a different extensions directory than your editor loads from (e.g. `~/.cursor/extensions/` vs `~/.vscode/extensions/`). Use `--extensions-dir` to target the correct path. After installing, run **Cmd+Shift+P → Developer: Reload Window**.

#### Keybindings

| Shortcut | Action |
|----------|--------|
| <kbd>Cmd</kbd>+<kbd>K</kbd> <kbd>V</kbd> | Open preview to the side |
| <kbd>Shift</kbd>+<kbd>Cmd</kbd>+<kbd>V</kbd> | Open preview (same tab) |

> [!TIP]
> The preview automatically follows your active markdown editor — no need to reopen when switching files.

The extension replaces the built-in markdown preview button with the GitHub icon. Theme toggle and TOC panel are in the top-right corner.

#### Scroll Sync

Bidirectional scroll sync between editor and preview:
- **Editor → Preview**: scrolling the editor smoothly scrolls the preview to the matching position
- **Preview → Editor**: scrolling the preview jumps the editor to the corresponding source line

---

## How It Works

```mermaid
flowchart LR
    MD["Markdown file"] --> P[marked + plugins]
    P --> H["highlight.js"]
    H --> HTML["GitHub-styled HTML"]
    HTML --> K["KaTeX (math)"]
    HTML --> M["Mermaid (diagrams)"]
    K --> R["Rendered preview"]
    M --> R
```

Both entry points share the same pipeline:

1. **marked** parses GFM with plugins: alerts, footnotes, front matter, emoji, auto-linking, syntax highlighting
2. **marked-highlight** + **highlight.js** handle code syntax highlighting
3. **source-lines** wraps all block renderers to inject `data-source-line` attributes (for scroll sync)
4. **github-markdown-css** provides GitHub's exact styling
5. **KaTeX** renders math client-side
6. **Mermaid** renders diagrams client-side

> [!NOTE]
> Both entry points load KaTeX, Mermaid, highlight.js CSS, and github-markdown-css from CDN. The standalone server also supports offline mode via `--init`. The VS Code extension ships as a ~420 KB `.vsix` with no vendored assets.

---

## Development

```bash
npm install                            # install dependencies
npm run build                          # bundle extension + server
npm run dev                            # build with sourcemaps (F5 debugging)
npm run typecheck                      # tsc type checking only
npm run package                        # build + create .vsix
npm test                               # build + VS Code e2e tests (headless)
npx tsx test/unit/frontmatter.test.mts # frontmatter unit tests
npx tsx test/unit/svg-slider.test.mts  # SVG slider unit tests
```

<details>
<summary>Project structure</summary>

```
ghmd/
  src/
    extension.ts        VS Code extension (bundled → dist/extension.cjs)
    serve.mts           Standalone server (bundled → dist/serve.mjs)
    frontmatter.ts      YAML front matter extension for marked
    source-lines.ts     Injects data-source-line attrs for scroll sync
    scroll-sync.js      Client-side bidirectional scroll sync
    ui.css              Shared UI styles (read at runtime by both entry points)
    toc.js              Shared TOC logic (read at runtime by both entry points)
  test/
    suite/              VS Code e2e tests (mocha + @vscode/test-electron)
    unit/               Unit tests (run with tsx, no VS Code required)
  dist/                 Build output (gitignored)
```

</details>

<details>
<summary>Updating dependencies</summary>

```bash
npm update                             # update node_modules
npm run build                          # rebuild vendor/ + dist/
npm run package                        # create new .vsix
```

</details>
