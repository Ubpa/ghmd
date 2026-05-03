const path = require('path');
const Mocha = require('mocha');

function run() {
  const mocha = new Mocha({ ui: 'tdd', timeout: 15000, color: true });
  mocha.addFile(path.join(__dirname, 'extension.test.cjs'));
  return new Promise((resolve, reject) => {
    mocha.run(failures => failures ? reject(new Error(`${failures} test(s) failed`)) : resolve());
  });
}

module.exports = { run };
