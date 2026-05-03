import { runTests } from '@vscode/test-electron';
import path from 'path';

const extensionDevelopmentPath = path.resolve(import.meta.dirname, '..');
const extensionTestsPath = path.resolve(import.meta.dirname, 'suite', 'index.cjs');

try {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--headless', '--disable-gpu', '--no-sandbox'],
  });
} catch (e) {
  console.error('Tests failed:', e);
  process.exit(1);
}
