import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// We exercise the real built binary so the tests cover actual CLI parsing,
// path-traversal guards, and the LISTENING stdout contract.
const SERVE = join(fileURLToPath(new URL('../..', import.meta.url)), 'dist', 'serve.mjs');

interface ServerHandle {
  url: string;
  port: number;
  stop: () => Promise<void>;
}

function startServer(args: string[], opts: { timeoutMs?: number } = {}): Promise<ServerHandle> {
  const timeout = opts.timeoutMs ?? 10000;
  return new Promise((resolveP, rejectP) => {
    const child = spawn('node', [SERVE, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { child.kill(); } catch { /* ignore */ }
        rejectP(new Error(`startup timed out (got: ${buf.slice(0, 200)})`));
      }
    }, timeout);
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      const m = /^LISTENING\s+(http:\/\/[^\s]+)\s*$/m.exec(buf);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        const url = m[1];
        const port = Number(new URL(url).port);
        resolveP({
          url,
          port,
          stop: () => new Promise<void>((r) => {
            child.once('exit', () => r());
            try { child.kill(); } catch { r(); }
          }),
        });
      }
    });
    child.stderr.on('data', (c: Buffer) => { buf += c.toString(); });
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        rejectP(new Error(`exited early (code=${code}, output=${buf.slice(0, 200)})`));
      }
    });
  });
}

async function fetchStatus(url: string): Promise<{ status: number; body: string }> {
  const r = await fetch(url);
  return { status: r.status, body: await r.text() };
}

const root = mkdtempSync(join(tmpdir(), 'ghmd-root-test-'));
mkdirSync(join(root, 'sub'), { recursive: true });
writeFileSync(join(root, 'README.md'), '# hello root\n');
writeFileSync(join(root, 'guide.md'), '# guide\n\nbody.\n');
writeFileSync(join(root, 'sub', 'inner.md'), '# inner\n');
writeFileSync(join(root, 'data.json'), '{"x":1}\n');

try {
  console.log('test: --root + --port 0 prints LISTENING with real port');
  {
    const s = await startServer(['--root', root, '--port', '0']);
    try {
      assert.ok(s.port > 0, `port should be picked, got ${s.port}`);
      assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(s.url), `url shape: ${s.url}`);
    } finally { await s.stop(); }
  }

  console.log('test: GET / serves README.md when present');
  {
    const s = await startServer(['--root', root, '--port', '0']);
    try {
      const r = await fetchStatus(s.url + '/');
      assert.equal(r.status, 200);
      assert.match(r.body, /hello root/, 'README content shown');
    } finally { await s.stop(); }
  }

  console.log('test: GET /?file=guide.md renders that file');
  {
    const s = await startServer(['--root', root, '--port', '0']);
    try {
      const r = await fetchStatus(s.url + '/?file=guide.md');
      assert.equal(r.status, 200);
      assert.match(r.body, /<h1[^>]*>guide<\/h1>/, 'renders guide');
    } finally { await s.stop(); }
  }

  console.log('test: GET /?file=sub/inner.md handles subdirectories');
  {
    const s = await startServer(['--root', root, '--port', '0']);
    try {
      const r = await fetchStatus(s.url + '/?file=sub/inner.md');
      assert.equal(r.status, 200);
      assert.match(r.body, /<h1[^>]*>inner<\/h1>/);
    } finally { await s.stop(); }
  }

  console.log('test: GET /?file=../escape.md returns 400');
  {
    const s = await startServer(['--root', root, '--port', '0']);
    try {
      const r = await fetchStatus(s.url + '/?file=' + encodeURIComponent('../escape.md'));
      assert.equal(r.status, 400);
      assert.match(r.body, /escapes root/);
    } finally { await s.stop(); }
  }

  console.log('test: GET /?file=data.json returns 400 (non-markdown)');
  {
    const s = await startServer(['--root', root, '--port', '0']);
    try {
      const r = await fetchStatus(s.url + '/?file=data.json');
      assert.equal(r.status, 400);
      assert.match(r.body, /\.md \/ \.markdown/);
    } finally { await s.stop(); }
  }

  console.log('test: GET /?file=missing.md returns 404');
  {
    const s = await startServer(['--root', root, '--port', '0']);
    try {
      const r = await fetchStatus(s.url + '/?file=missing.md');
      assert.equal(r.status, 404);
    } finally { await s.stop(); }
  }

  console.log('test: absolute paths are rejected');
  {
    const s = await startServer(['--root', root, '--port', '0']);
    try {
      const r = await fetchStatus(s.url + '/?file=' + encodeURIComponent('/etc/passwd'));
      assert.equal(r.status, 400);
    } finally { await s.stop(); }
  }

  console.log('test: single-file mode still works (back-compat)');
  {
    const s = await startServer([join(root, 'guide.md'), '0']);
    try {
      const r = await fetchStatus(s.url + '/');
      assert.equal(r.status, 200);
      assert.match(r.body, /<h1[^>]*>guide<\/h1>/);
    } finally { await s.stop(); }
  }

  console.log('all root-mode tests passed ✓');
} finally {
  rmSync(root, { recursive: true, force: true });
}
