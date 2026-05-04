# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

ghmd is a GitHub-style Markdown previewer that ships as both a standalone HTTP server (`serve.mts`) and a VS Code extension (`src/extension.ts`). Both share the same rendering pipeline (marked + highlight.js + KaTeX + Mermaid) and the same UI assets (`src/ui.css`, `src/toc.js`).

## Commands

```bash
npm run build        # esbuild: extension.ts → dist/extension.cjs, serve.mts → serve.mjs
npm run build:ext    # extension only
npm run build:serve  # server only
npm run dev          # extension with sourcemaps (for F5 debugging)
npm run typecheck    # tsc --noEmit (type checking only, no emit)
npm run package      # build + create .vsix
npm test             # build + compile tests + run VS Code e2e tests (headless)

node dist/serve.mjs <file.md> [port]   # standalone server (default port 6419)
node dist/serve.mjs --init             # download katex+mermaid for offline mode
```

## Architecture

**TypeScript + esbuild:** All source is TypeScript. esbuild compiles and bundles — `tsc` is used only for type checking (`noEmit`). `tsconfig.json` has `"type": "module"` in `package.json` so `.ts` files are ESM; esbuild produces CJS output for the extension.

**Two entry points, one rendering pipeline:**

- `src/serve.mts` — standalone Node HTTP server (ESM). Compiled by esbuild to `dist/serve.mjs`. KaTeX/Mermaid load from CDN unless `--init` was run (then local from `node_modules/`).
- `src/extension.ts` — VS Code extension. Bundled by esbuild into `dist/extension.cjs` (CJS, minified, `vscode` externalized). All external assets (KaTeX, Mermaid, highlight.js CSS, github-markdown-css) load from CDN.

**Shared UI (SSOT):** `src/ui.css`, `src/toc.js`, and `src/scroll-sync.js` are read at runtime by both entry points via `fs.readFileSync` and inlined into the HTML. They are plain JS/CSS, not TypeScript — they run in the browser, not in Node.

**CDN assets:** The extension loads all external CSS and JS from `cdn.jsdelivr.net` at runtime — no vendored files are shipped.

**Build output:** `dist/extension.cjs` and `dist/serve.mjs` are both gitignored build artifacts.

## Key Design Decisions

- The extension reads `src/ui.css` and `src/toc.js` from `path.join(__dirname, '..', 'src', ...)` because `__dirname` is `dist/` after bundling. There's a regression test for this.
- The `slugify()` function is duplicated in both entry points (they need identical heading anchors but share no importable module).
- Theme state: the server uses `localStorage`, the extension uses a module-level `activeTheme` variable and round-trips theme changes via `postMessage`.
- Marked plugins are used for all GitHub-supported features: `marked-alert`, `marked-footnote`, `marked-frontmatter`, `marked-highlight`, `marked-emoji` (with gemoji), `marked-linkify-it`. Custom renderer only handles mermaid, math, and diff blocks.
- The code renderer returns `false` for non-special languages, letting `marked-highlight` handle them.
- **Scroll sync** uses a renderer wrapper pattern: `src/source-lines.ts` snapshots the current renderer after all plugins register, then wraps each block type's output with `data-source-line` attributes via regex injection on the first opening tag. Zero renderer reimplementation. `src/scroll-sync.js` handles bidirectional sync client-side.
- `katex` and `mermaid` are `optionalDependencies` — the standalone server works without them (falls back to CDN), and `npm install` won't fail if they can't be built.

## Testing

Tests are VS Code extension e2e tests using `@vscode/test-electron` + Mocha (TDD ui). Run with `npm test`. Test files are in TypeScript, compiled to `dist/test/suite/` by esbuild before running.
- `test/runTests.ts` — launches headless VS Code (run via `tsx`)
- `test/suite/extension.test.ts` — activation, command registration, preview panel, asset path regression
