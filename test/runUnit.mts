// Runs every test/unit/*.test.mts in-process. Each test file executes its
// assertions as import side effects and throws on failure, so importing them in
// sequence is the whole harness. Exits non-zero on the first failure.
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const unitDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'unit');
const files = readdirSync(unitDir)
  .filter(f => f.endsWith('.test.mts'))
  .sort();

let failed = 0;
for (const file of files) {
  console.log(`\n──────── ${file} ────────`);
  try {
    await import(pathToFileURL(path.join(unitDir, file)).href);
  } catch (err) {
    failed++;
    console.error(`✗ ${file} FAILED:\n`, err);
  }
}

console.log(`\n${failed === 0 ? '✓' : '✗'} unit suites: ${files.length - failed}/${files.length} passed`);
process.exit(failed === 0 ? 0 : 1);
