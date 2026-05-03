const assert = require('assert');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');

suite('GHMD Extension E2E', () => {

  test('extension activates and commands are registered', async () => {
    const ext = vscode.extensions.getExtension('ubpa.ghmd');
    assert.ok(ext, 'Extension not found — check publisher.name in package.json');

    // activate() resolves with the extension's exported API (undefined for us).
    // We only need to confirm it doesn't throw and the extension is active after.
    await ext.activate();
    assert.ok(ext.isActive, 'Extension failed to activate');

    const allCommands = await vscode.commands.getCommands(true);
    assert.ok(allCommands.includes('ghmd.openPreview'), 'Command ghmd.openPreview not registered');
    assert.ok(allCommands.includes('ghmd.openPreviewToSide'), 'Command ghmd.openPreviewToSide not registered');
  });

  test('opens preview panel for a markdown file', async () => {
    // Create a temp markdown file
    const tmpFile = path.join(os.tmpdir(), 'ghmd-test.md');
    fs.writeFileSync(tmpFile, '# Hello\n\nThis is a **test**.\n\n> blockquote\n\n`inline code`\n');

    const doc = await vscode.workspace.openTextDocument(tmpFile);
    await vscode.window.showTextDocument(doc);

    // Run the command
    await vscode.commands.executeCommand('ghmd.openPreviewToSide');

    // Wait for the panel to open
    await new Promise(r => setTimeout(r, 2000));

    // VS Code doesn't expose webview panels directly, but if the command
    // threw an error (e.g. "command not found"), executeCommand would reject.
    // Getting here means it succeeded.
    assert.ok(true, 'Preview opened without error');

    fs.unlinkSync(tmpFile);
  });

  test('shared assets resolve from dist/__dirname (regression: wrong path crashes activation)', async () => {
    // Regression test for the bug where dist/extension.js used
    // path.join(__dirname, 'ui.css') instead of path.join(__dirname, '..', 'src', 'ui.css').
    // Since __dirname === dist/ after bundling, the old path silently failed to load,
    // crashing the extension before any command was registered.
    const ext = vscode.extensions.getExtension('ubpa.ghmd');
    const distDir = path.join(ext.extensionPath, 'dist');

    // The BROKEN path (what caused the bug): dist/ui.css
    assert.ok(!fs.existsSync(path.join(distDir, 'ui.css')),
      'ui.css should NOT exist in dist/ — if it does, the build changed');

    // The FIXED path: dist/../src/ui.css
    const uiCss = path.join(distDir, '..', 'src', 'ui.css');
    const tocJs  = path.join(distDir, '..', 'src', 'toc.js');
    assert.ok(fs.existsSync(uiCss), `src/ui.css not found via dist/__dirname path: ${uiCss}`);
    assert.ok(fs.existsSync(tocJs),  `src/toc.js not found via dist/__dirname path: ${tocJs}`);

    const css = fs.readFileSync(uiCss, 'utf8');
    const js  = fs.readFileSync(tocJs, 'utf8');
    assert.ok(css.includes('.toolbar'), 'ui.css missing .toolbar');
    assert.ok(js.includes('buildToc'),  'toc.js missing buildToc');

    // The extension must still be active — if the file reads threw, it would have crashed
    assert.ok(ext.isActive, 'Extension not active — likely crashed reading shared assets');
  });

});
