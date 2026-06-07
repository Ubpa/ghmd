import { runTests } from '@vscode/test-electron';
import path from 'path';
import fs from 'fs';

// Load the extension from the staged copy (.vsix-build), whose manifest name is
// the vsce-legal "ghmd" — the root package.json name is the scoped npm id
// "@xubpa/ghmd", which would make the extension id "ubpa.@xubpa/ghmd" and break
// getExtension('ubpa.ghmd'). The test code itself still lives in the root dist/.
const repoRoot = path.resolve(import.meta.dirname, '..');
const stagedPath = path.join(repoRoot, '.vsix-build');
if (!fs.existsSync(path.join(stagedPath, 'package.json'))) {
  console.error('Staged extension not found — run `npm run vscode:stage` first (test:e2e does this).');
  process.exit(1);
}

const extensionDevelopmentPath = stagedPath;
const extensionTestsPath = path.resolve(repoRoot, 'dist', 'test', 'suite', 'index.cjs');

process.env.VSCODE_CLI = '1';

try {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--headless', '--disable-gpu', '--no-sandbox'],
  });
} catch (e) {
  console.error('Tests failed:', (e as Error).message);
  process.exit(1);
}
