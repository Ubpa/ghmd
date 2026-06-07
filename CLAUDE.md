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
npm run package      # build + stage + create .vsix (via scripts/stage-vscode.mjs)
npm run install-ext  # build + package + install the .vsix into VS Code
npm run vscode:dev   # build (sourcemaps) + stage to .vsix-build/ for F5 debugging
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

**npm vs VS Code identity (the dual-name problem):** `package.json` `name` is the scoped `@xubpa/ghmd` (the bare `ghmd` is taken on npm). But vsce rejects `@`/`/` in an extension name. One manifest can't satisfy both. So `package.json` stays npm-native and **is never edited for VS Code**. `scripts/stage-vscode.mjs` generates a throwaway `.vsix-build/` staging dir whose `package.json` is rewritten to `name: "ghmd"` (npm-only fields — `bin`, `exports`, `files`, `dependencies` — stripped since esbuild bundles everything into `extension.cjs`). `npm run package`/`install-ext`/`vscode:dev` and F5 (`.vscode/launch.json` → `extensionDevelopmentPath=.vsix-build`) all run from this staging dir. `.vsix-build/` is gitignored.

## Key Design Decisions

- The extension reads `src/ui.css` and `src/toc.js` from `path.join(__dirname, '..', 'src', ...)` because `__dirname` is `dist/` after bundling. There's a regression test for this.
- Heading anchors live in `src/heading.ts` (`createHeadingRenderer()`): a marked extension that slugifies and dedupes duplicate ids GitHub-style (`title`, `title-1`, `title-2`…), with a `hooks.preprocess` reset so the counter is per-parse. Both entry points import it.
- Theme state: the server uses `localStorage`, the extension uses a module-level `activeTheme` variable and round-trips theme changes via `postMessage`.
- Marked plugins are used for all GitHub-supported features: `marked-alert`, `marked-footnote`, `marked-frontmatter`, `marked-highlight`, `marked-emoji` (with gemoji), `marked-linkify-it`. Custom renderer only handles mermaid, math, and diff blocks.
- The code renderer returns `false` for non-special languages, letting `marked-highlight` handle them.
- **Scroll sync** uses a renderer wrapper pattern: `src/source-lines.ts` snapshots the current renderer after all plugins register, then wraps each block type's output with `data-source-line` attributes via regex injection on the first opening tag. Zero renderer reimplementation. `src/scroll-sync.js` handles bidirectional sync client-side.
- `katex` and `mermaid` are `optionalDependencies` — the standalone server works without them (falls back to CDN), and `npm install` won't fail if they can't be built.

## Testing

Two layers, both run by `npm test` (unit first, then e2e):

**Unit (`npm run test:unit`)** — fast, in-process, no VS Code. `test/runUnit.mts` imports every `test/unit/*.test.mts` in sequence; each file runs `node:assert` checks as import side effects and throws on failure. These exercise the real `createMarked` pipeline (`src/render.ts`) and the built `dist/serve.mjs`, so run `npm run build` first if testing in isolation (serve-root spawns the binary).

**E2e (`npm run test:e2e`)** — VS Code extension tests using `@vscode/test-electron` + Mocha (TDD ui), compiled to `dist/test/suite/` by esbuild before running.
- `test/runTests.ts` — launches headless VS Code (run via `tsx`)
- `test/suite/extension.test.ts` — activation, command registration, preview panel, asset path regression

Note: asset paths in `serve.mts` use `fileURLToPath(import.meta.resolve(...))`, never `URL.pathname` — on Windows the latter yields `/C:/…` which `path.join` corrupts into `C:\C:\…`.
