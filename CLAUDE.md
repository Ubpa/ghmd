# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

ghmd is a GitHub-style Markdown previewer that ships as both a standalone HTTP server (`serve.mjs`) and a VS Code extension (`src/extension.cjs`). Both share the same rendering pipeline (marked + highlight.js + KaTeX + Mermaid) and the same UI assets (`src/ui.css`, `src/toc.js`).

## Commands

```bash
npm run build        # vendor assets + esbuild bundle → dist/extension.js
npm run dev          # same but with sourcemaps (for F5 debugging)
npm run package      # build + create .vsix
npm test             # build + run VS Code e2e tests (headless)

node serve.mjs <file.md> [port]   # standalone server (default port 6419)
node serve.mjs --init             # download katex+mermaid for offline mode
```

## Architecture

**Two entry points, one rendering pipeline:**

- `serve.mjs` — standalone Node HTTP server (ESM). Reads markdown, serves a full HTML page with live-reload polling (`/__poll`). KaTeX/Mermaid load from CDN unless `--init` was run (then local from `node_modules/`).
- `src/extension.cjs` — VS Code extension (CJS, bundled by esbuild into `dist/extension.js`). Uses webview panels with the same markdown pipeline. KaTeX/Mermaid use CDN-first with local fallback from `vendor/`.

**Shared UI (SSOT):** `src/ui.css` and `src/toc.js` are read at runtime by both entry points via `fs.readFileSync` and inlined into the HTML. They are not bundled by esbuild — they must stay as separate files in `src/`.

**Vendor assets:** `scripts/vendor.mjs` copies dist files from `node_modules/` into `vendor/` (CSS, KaTeX JS/CSS/fonts, Mermaid). The `vendor/` directory is gitignored but included in the .vsix package.

**Build output:** `dist/extension.js` is the esbuild bundle (CJS, minified, `vscode` externalized). Also gitignored.

## Key Design Decisions

- The extension reads `src/ui.css` and `src/toc.js` from `path.join(__dirname, '..', 'src', ...)` because `__dirname` is `dist/` after bundling. There's a regression test for this.
- The `slugify()` function is duplicated in both entry points (they need identical heading anchors but share no importable module).
- Theme state: the server uses `localStorage`, the extension uses a module-level `activeTheme` variable and round-trips theme changes via `postMessage`.
- Marked plugins are used for all GitHub-supported features: `marked-alert`, `marked-footnote`, `marked-frontmatter`, `marked-highlight`, `marked-emoji` (with gemoji), `marked-linkify-it`. Custom renderer only handles mermaid, math, and diff blocks.
- The code renderer returns `false` for non-special languages, letting `marked-highlight` handle them.
- **Scroll sync** uses a renderer wrapper pattern: `src/source-lines.cjs` snapshots the current renderer after all plugins register, then wraps each block type's output with `data-source-line` attributes via regex injection on the first opening tag. Zero renderer reimplementation. `src/scroll-sync.js` handles bidirectional sync client-side.
- `katex` and `mermaid` are `optionalDependencies` — the standalone server works without them (falls back to CDN), and `npm install` won't fail if they can't be built.

## Testing

Tests are VS Code extension e2e tests using `@vscode/test-electron` + Mocha (TDD ui). Run with `npm test`. Test files:
- `test/runTests.mjs` — launches headless VS Code
- `test/suite/extension.test.cjs` — activation, command registration, preview panel, asset path regression
