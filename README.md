# ghmd — GitHub Markdown Preview

Renders Markdown locally with full GitHub feature support. Works as a **standalone server** (browser) and a **VS Code extension**.

## Features

- GitHub Alerts (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`)
- Mermaid diagrams (flowchart, sequence, gantt, class, state, ER, pie, git)
- LaTeX math via KaTeX (inline `$...$` and block `$$...$$`)
- `<details>` collapsible sections
- Footnotes, task lists, diff highlighting
- `<kbd>`, `<sub>/<sup>`, `<picture>` theme-aware images
- Code syntax highlighting (highlight.js)
- Light/dark theme toggle
- Live reload on file change

## Install

```bash
git clone git@github.com:Ubpa/ghmd.git
cd ghmd
npm install
```

## Usage

### Standalone Server (Browser)

```bash
node serve.mjs <file.md> [port]
```

Examples:

```bash
node serve.mjs README.md              # http://localhost:6419
node serve.mjs docs/guide.md 8080     # http://localhost:8080
```

Features:
- Auto-reloads in browser when the file changes
- Theme toggle button in top-right corner (saved in localStorage)
- KaTeX and Mermaid load from CDN (latest version)

#### Offline Mode

```bash
node serve.mjs --init                  # one-time: downloads katex + mermaid
node serve.mjs README.md              # now fully offline
```

### VS Code Extension

#### Install

```bash
npm run package                        # build + create .vsix
code --install-extension ghmd-0.1.0.vsix
```

#### Use

Open any `.md` file, then:

- <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> (Mac) / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> (Win/Linux)
- Or Command Palette → `GHMD: Open Preview to the Side`

The preview updates live as you edit. Theme toggle button in top-right corner.

## Development

```bash
npm install                            # install dependencies
npm run build                          # bundle extension + copy vendor assets
npm run dev                            # build with sourcemaps (F5 debugging)
npm run package                        # build + create .vsix
```

### Updating Dependencies

```bash
npm update                             # update node_modules
npm run build                          # rebuild vendor/ + dist/
npm run package                        # create new .vsix
```

## Project Structure

```
ghmd/
  serve.mjs             Standalone server (single file, zero build step)
  src/extension.cjs     VS Code extension source
  scripts/vendor.mjs    Copies dist files from node_modules → vendor/
  dist/                 Bundled extension output (generated, gitignored)
  vendor/               Runtime assets for VS Code extension (generated, gitignored)
    css/                github-markdown-css + highlight.js themes
    katex/              katex.min.js, katex.min.css, fonts/
    mermaid.min.js      Mermaid diagram renderer
```

## How It Works

Both the server and extension use the same rendering pipeline:

1. **marked** parses GFM with plugins for alerts and footnotes
2. **highlight.js** does code syntax highlighting
3. **github-markdown-css** provides GitHub's exact styling
4. **KaTeX** renders LaTeX math client-side
5. **Mermaid** renders diagrams client-side

The standalone server loads KaTeX/Mermaid from CDN by default (or locally after `--init`). The VS Code extension bundles everything — marked/hljs are compiled into `dist/extension.js` via esbuild, and KaTeX/Mermaid dist files ship in `vendor/` (~1.5 MB compressed in .vsix).
