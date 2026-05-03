import { runTests } from '@vscode/test-electron';
import path from 'path';

const extensionDevelopmentPath = path.resolve(import.meta.dirname, '..');
const extensionTestsPath = path.resolve(import.meta.dirname, 'suite', 'index.cjs');

// Prevent VS Code from opening Terminal.app to detect login shell environment.
// VS Code skips resolveShellEnv() when VSCODE_CLI is set (it assumes a CLI launch already has the shell env).
process.env.VSCODE_CLI = '1';

try {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--headless', '--disable-gpu', '--no-sandbox'],
  });
} catch (e) {
  console.error('Tests failed:', e.message);
  process.exit(1);
}
