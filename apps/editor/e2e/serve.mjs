// Serves the built editor (apps/editor/out) against a throwaway copy of a local
// workspace (default fixtures/grants/workspace, gitignored), so e2e runs never touch a real .sherlock dir.
// Usage: node e2e/serve.mjs [port]   (SHERLOCK_E2E_WORKSPACE overrides the fixture)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../cli/src/server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = process.env.SHERLOCK_E2E_WORKSPACE || path.resolve(here, '../../../fixtures/grants/workspace');
const port = Number(process.argv[2] || 4879);
if (!fs.existsSync(path.join(fixture, 'model.json'))) {
  console.error(`No workspace at ${fixture}. The e2e data is local only (fixtures/ is gitignored):\n`
    + 'copy a .sherlock workspace (model.json, prd.json, project.json, feedback.json) there, or set SHERLOCK_E2E_WORKSPACE.');
  process.exit(1);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlock-e2e-'));
for (const f of ['model.json', 'prd.json', 'project.json', 'feedback.json']) {
  if (fs.existsSync(path.join(fixture, f))) fs.copyFileSync(path.join(fixture, f), path.join(dir, f));
}

const server = createServer(dir);
server.listen(port, '127.0.0.1', () => console.log(`e2e server on http://localhost:${port} (${dir})`));
const stop = () => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
