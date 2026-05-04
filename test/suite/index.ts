import path from 'path';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', timeout: 15000, color: true });
  mocha.addFile(path.join(__dirname, 'extension.test.js'));
  return new Promise((resolve, reject) => {
    mocha.run(failures => failures ? reject(new Error(`${failures} test(s) failed`)) : resolve());
  });
}
