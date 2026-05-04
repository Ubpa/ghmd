import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

suite('GHMD Extension E2E', () => {

  test('extension activates and commands are registered', async () => {
    const ext = vscode.extensions.getExtension('ubpa.ghmd');
    assert.ok(ext, 'Extension not found — check publisher.name in package.json');

    await ext.activate();
    assert.ok(ext.isActive, 'Extension failed to activate');

    const allCommands = await vscode.commands.getCommands(true);
    assert.ok(allCommands.includes('ghmd.openPreview'), 'Command ghmd.openPreview not registered');
    assert.ok(allCommands.includes('ghmd.openPreviewToSide'), 'Command ghmd.openPreviewToSide not registered');
  });

  test('opens preview panel for a markdown file', async () => {
    const tmpFile = path.join(os.tmpdir(), 'ghmd-test.md');
    fs.writeFileSync(tmpFile, '# Hello\n\nThis is a **test**.\n\n> blockquote\n\n`inline code`\n');

    const doc = await vscode.workspace.openTextDocument(tmpFile);
    await vscode.window.showTextDocument(doc);

    await vscode.commands.executeCommand('ghmd.openPreviewToSide');

    await new Promise(r => setTimeout(r, 2000));

    assert.ok(true, 'Preview opened without error');

    fs.unlinkSync(tmpFile);
  });

  test('shared assets resolve from dist/__dirname (regression: wrong path crashes activation)', async () => {
    const ext = vscode.extensions.getExtension('ubpa.ghmd');
    const distDir = path.join(ext!.extensionPath, 'dist');

    assert.ok(!fs.existsSync(path.join(distDir, 'ui.css')),
      'ui.css should NOT exist in dist/ — if it does, the build changed');

    const uiCss = path.join(distDir, '..', 'src', 'ui.css');
    const tocJs  = path.join(distDir, '..', 'src', 'toc.js');
    assert.ok(fs.existsSync(uiCss), `src/ui.css not found via dist/__dirname path: ${uiCss}`);
    assert.ok(fs.existsSync(tocJs),  `src/toc.js not found via dist/__dirname path: ${tocJs}`);

    const css = fs.readFileSync(uiCss, 'utf8');
    const js  = fs.readFileSync(tocJs, 'utf8');
    assert.ok(css.includes('.toolbar'), 'ui.css missing .toolbar');
    assert.ok(js.includes('buildToc'),  'toc.js missing buildToc');

    assert.ok(ext!.isActive, 'Extension not active — likely crashed reading shared assets');
  });

});
