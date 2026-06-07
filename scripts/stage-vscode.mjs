#!/usr/bin/env node
// Stage a VS Code-installable copy of the extension WITHOUT touching the
// source package.json.
//
// Why this exists: the npm package name is the scoped "@xubpa/ghmd" (the bare
// "ghmd" is taken on npm), but vsce rejects "@" / "/" in an extension name.
// One package.json can't satisfy both. So we keep package.json npm-native and
// generate a throwaway staging dir whose manifest is name="ghmd".
//
//   node scripts/stage-vscode.mjs            # just build the staging dir
//   node scripts/stage-vscode.mjs --package  # + vsce package -> ghmd-<ver>.vsix in repo root
//   node scripts/stage-vscode.mjs --install   # + install the produced .vsix into VS Code

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, '.vsix-build');

const args = process.argv.slice(2);
const doPackage = args.includes('--package') || args.includes('--install');
const doInstall = args.includes('--install');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// Strip npm-only fields and rewrite the name to a vsce-legal id.
// dependencies are dropped because esbuild bundles everything into
// extension.cjs — keeping them only makes vsce run `npm list` against a
// node_modules that doesn't exist in the staging dir.
const {
  bin: _bin,
  exports: _exports,
  files: _files,
  scripts: _scripts,
  devDependencies: _dev,
  dependencies: _deps,
  optionalDependencies: _opt,
  ...rest
} = pkg;
const manifest = { ...rest, name: 'ghmd' };

// Assets the bundled extension reads at runtime via path.join(__dirname,'..','src',...).
const srcAssets = ['ui.css', 'toc.js', 'scroll-sync.js', 'svg-slider.js'];
const rootFiles = ['README.md', 'LICENSE'];

function reset(dir) {
  // Clear children rather than the dir itself: on Windows the dir may be the
  // cwd of another shell, which makes removing the root EPERM.
  fs.mkdirSync(dir, { recursive: true });
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

function copy(rel) {
  const from = path.join(root, rel);
  const to = path.join(stage, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function build() {
  const bundle = path.join(root, 'dist', 'extension.cjs');
  if (!fs.existsSync(bundle)) {
    console.error('✗ dist/extension.cjs missing — run `npm run build:ext` first.');
    process.exit(1);
  }

  reset(stage);
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');

  // A .vscodeignore so vsce ships only what the extension needs.
  fs.writeFileSync(
    path.join(stage, '.vscodeignore'),
    ['**/*.map', '**/*.ts', '**/*.mts'].join('\n') + '\n',
  );

  copy(path.join('dist', 'extension.cjs'));
  // Sourcemap, if present (npm run dev emits it) — lets F5 debugging map to TS.
  if (fs.existsSync(path.join(root, 'dist', 'extension.cjs.map'))) {
    copy(path.join('dist', 'extension.cjs.map'));
  }
  for (const a of srcAssets) copy(path.join('src', a));
  for (const f of rootFiles) if (fs.existsSync(path.join(root, f))) copy(f);

  console.log(`✓ staged VS Code extension (name="ghmd") at ${path.relative(root, stage)}/`);
}

const isWin = process.platform === 'win32';

// On Windows, .cmd shims (npx/code) can't be execFile'd directly (Node EINVAL),
// so go through the shell. Run the binary directly elsewhere.
function run(bin, argv, opts = {}) {
  const r = isWin
    ? spawnSync(bin, argv, { stdio: 'inherit', shell: true, ...opts })
    : execFileSync(bin, argv, { stdio: 'inherit', ...opts }) && { status: 0 };
  if (r && r.status) process.exit(r.status);
}

function vsce(extraArgs) {
  run('npx', ['@vscode/vsce', ...extraArgs], { cwd: stage });
}

build();

if (doPackage) {
  const vsixName = `ghmd-${manifest.version}.vsix`;
  const out = path.join(root, vsixName);
  vsce(['package', '--allow-missing-repository', '--out', out]);
  console.log(`✓ packaged ${vsixName}`);

  if (doInstall) {
    run('code', ['--install-extension', out, '--force']);
    console.log('✓ installed into VS Code');
  }
}
