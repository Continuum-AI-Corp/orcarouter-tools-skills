/*
cli.test.mjs — the client's own logic against canned server answers, offline.

NOT A SUBSTITUTE FOR scripts/e2e.mjs. These answers are copied from the
server's handlers (controller/toolrouter_v1.go, middleware/auth.go in the
OrcaRouter repo) and can drift from them; the e2e is what proves the contract.
This file pins what the CLI does WITH an answer: what it sends, what it prints,
which exit code it returns.

The fake server runs in THIS process, so the CLI is spawned asynchronously —
a blocking execFileSync would stall the loop that has to answer it.
*/
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'orca-tools.js');

let server;
let base;
let home;
const seen = [];
const routes = new Map();

before(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-tools-test-'));
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      const r = routes.get(`${req.method} ${req.url.split('?')[0]}`);
      if (!r) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: false, code: 'tool_not_found', message: 'no such tool' }));
        return;
      }
      res.writeHead(r.status || 200, { 'content-type': 'application/json', ...(r.headers || {}) });
      res.end(r.body === undefined ? '' : JSON.stringify(r.body));
    });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(home, { recursive: true, force: true });
});

const cli = (args, env = {}) =>
  new Promise((ok) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { env: { ...process.env, ORCA_TOOLS_HOME: home, ORCA_TOOLS_KEY: 'sk-test', ORCA_TOOLS_BASE: base, ...env } },
      (err, stdout, stderr) => ok({ status: err ? err.code : 0, stdout, stderr }),
    );
  });

const last = () => seen[seen.length - 1];

test('keys add --base stores the host with the key (the console self-host snippet)', async () => {
  const r = await cli(['keys', 'add', '-l', 'main', '-k', 'sk-abc', '--base', 'https://orca.example.com/'], {
    ORCA_TOOLS_KEY: '',
    ORCA_TOOLS_BASE: '',
  });
  assert.equal(r.status, 0, r.stderr);
  const c = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8'));
  assert.equal(c.base, 'https://orca.example.com');
  assert.equal(c.keys.main.key, 'sk-abc');
});

test('discover prints the sell price, and an unpriced tool as not for sale', async () => {
  routes.set('POST /v1/tools/discover', {
    body: {
      success: true,
      data: {
        results: [
          { id: 'exa.search', provider: 'exa', display_name: 'Exa', score: 3.2,
            price: { mode: 'per_result', unit: 'result', for_sale: true, sell_usd: 0.005 },
            health: { ok: true, verdict: 'healthy', p50_ms: 640 } },
          { id: 'acme.lookup', provider: 'acme', display_name: 'Acme',
            price: { mode: 'per_call', unit: '', for_sale: false },
            health: { ok: null, verdict: 'unknown' } },
        ],
      },
    },
  });
  const r = await cli(['discover', '-q', 'search', '-l', '5']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /exa\.search .*\$0\.005\/result/);
  assert.match(r.stdout, /acme\.lookup .*not for sale/);
  assert.deepEqual(JSON.parse(last().body), { q: 'search', limit: 5 });
  assert.equal(last().headers.authorization, 'Bearer sk-test');
});

test('run sends approval_id in the body and the run ref / firewall ids as headers', async () => {
  routes.set('POST /v1/tools/exa.search/run', {
    body: { success: true, data: { run_id: 'run_1', status: 'completed', billed_usd: 0.025, units: 5, output: { ok: 1 } } },
  });
  const r = await cli([
    'run', '-t', 'exa.search', '-i', '{"query":"x"}',
    '--approval-id', '42', '--firewall-approval', 'fa_1, fa_2', '--run-ref', 'lead-scan',
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(last().body), { input: { query: 'x' }, approval_id: 42 });
  assert.equal(last().headers['x-orcarouter-firewall-approval'], 'fa_1,fa_2');
  assert.equal(last().headers['x-orca-run-ref'], 'lead-scan');
  assert.match(r.stdout, /cost +\$0\.025/);
});

test('a plain run sends neither extra header nor approval_id', async () => {
  const r = await cli(['run', '-t', 'exa.search', '-i', '{"query":"x"}']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(last().body), { input: { query: 'x' } });
  assert.equal(last().headers['x-orca-run-ref'], undefined);
  assert.equal(last().headers['x-orcarouter-firewall-approval'], undefined);
});

test('--approval-id must be a positive integer', async () => {
  const r = await cli(['run', '-t', 'exa.search', '-i', '{}', '--approval-id', 'abc']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /approval-id/);
});

test('billing pending is not printed as a dash or as $0', async () => {
  routes.set('POST /v1/tools/exa.search/run', {
    body: { success: true, data: { run_id: 'run_2', status: 'completed', billed_usd: null, billing: 'pending', output: [] } },
  });
  const r = await cli(['run', '-t', 'exa.search', '-i', '{"query":"x"}']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /cost +pending .*WILL be charged.*runs get -r run_2/);

  routes.set('POST /v1/tools/exa.search/run', {
    body: { success: true, data: { run_id: 'run_3', status: 'completed', billed_usd: null, billing: 'unrecorded', output: [] } },
  });
  const r2 = await cli(['run', '-t', 'exa.search', '-i', '{"query":"x"}']);
  assert.match(r2.stdout, /cost +\$0 \(billing unrecorded/);
});

test('policy_declined prints the approval id and how to retry, exit 2', async () => {
  routes.set('POST /v1/tools/exa.search/run', {
    status: 402,
    body: { success: false, code: 'policy_declined', message: 'approval required',
            deny: { reason: 'approval_required', approval_id: 7, hint: 'ask a human' } },
  });
  const r = await cli(['run', '-t', 'exa.search', '-i', '{"query":"x"}']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^\[policy_declined\] approval required/);
  assert.match(r.stderr, /--approval-id 7/);
});

test('a provider failure says whether a retry is safe and how long to wait', async () => {
  routes.set('POST /v1/tools/exa.search/run', {
    status: 504,
    headers: { 'retry-after': '3' },
    body: { success: false, code: 'provider_timeout', message: 'timed out', outcome: 'unknown', retry_safe: false },
  });
  const r = await cli(['run', '-t', 'exa.search', '-i', '{"query":"x"}']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /outcome +unknown/);
  assert.match(r.stderr, /retry_safe +NO/);
  assert.match(r.stderr, /retry_after 3s/);
});

test('-j puts the whole refusal body on stderr', async () => {
  const r = await cli(['run', '-t', 'exa.search', '-i', '{"query":"x"}', '-j']);
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stderr).retry_safe, false);
});

test('the key layer refusal {"error":{message,code}} keeps its message and code', async () => {
  routes.set('GET /v1/tools/balance', {
    status: 401,
    body: { error: { message: 'invalid API key', type: 'orca_error', code: 'invalid_api_key' } },
  });
  const r = await cli(['balance']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^\[invalid_api_key\] invalid API key/);
});

test('the string-shaped auth refusal keeps its reason', async () => {
  routes.set('GET /v1/tools/balance', {
    status: 403,
    body: { error: 'agent_paused', agent_id: 3, reason: 'paused by operator' },
  });
  const r = await cli(['balance']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^\[agent_paused\] agent_paused: paused by operator/);
});

test('413 with an empty body names the size cap', async () => {
  routes.set('GET /v1/tools/balance', { status: 413 });
  const r = await cli(['balance']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /1 MiB/);
});

test('balance shows wallet and spendable, and sends the run ref', async () => {
  routes.set('GET /v1/tools/balance', {
    body: { success: true, data: { wallet_usd: 12.4, spendable_usd: 0.5, run_left_usd: 0.2 } },
  });
  const r = await cli(['balance', '--run-ref', 'job-1']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /wallet +\$12\.40/);
  assert.match(r.stdout, /spendable \$0\.5\b/);
  assert.match(r.stdout, /run ref +\$0\.2\b/);
  assert.equal(last().headers['x-orca-run-ref'], 'job-1');
});

test('an unreachable host exits 4 and names the host', async () => {
  const r = await cli(['balance'], { ORCA_TOOLS_BASE: 'http://127.0.0.1:1' });
  assert.equal(r.status, 4);
  assert.match(r.stderr, /cannot reach http:\/\/127\.0\.0\.1:1/);
});
