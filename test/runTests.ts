import { runTests } from '@vscode/test-electron';
import path from 'path';

const extensionDevelopmentPath = path.resolve(import.meta.dirname, '..');
const extensionTestsPath = path.resolve(import.meta.dirname, '..', 'dist', 'test', 'suite', 'index.js');

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
