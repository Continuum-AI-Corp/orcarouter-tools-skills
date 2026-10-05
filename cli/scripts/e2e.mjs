#!/usr/bin/env node
/*
e2e.mjs — the whole loop against a REAL local OrcaRouter, through the CLI
binary, with real money movement.

WHY NOT UNIT TESTS WITH A STUBBED FETCH. Every bug this client has actually
had was in the contract, not in the logic: a key stored with the wrong prefix,
a manifest field that does not exist, an https-only base_url, a response field
named something else. A stubbed server would have agreed with every one of
those mistakes.

WHAT IT ASSERTS, in the order a first-time user hits it:
  setup → discover → inspect → run → runs list → runs get → balance → meta
against a server built from OrcaRouter main (see dev-backend.mjs)
plus the three refusals a client must get right (no key, bad input, unknown
tool), and the two money facts (the wallet moved; the upstream was called once
with the platform's stored credential).

It brings the server up itself and tears it down, so it leaves nothing behind
and can be run twice in a row.
*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bringUp, LOG_DB, mysql, SELL_USD, tearDown } from './dev-backend.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const CLI = path.join(REPO, 'bin', 'orca-tools.js');
const HOME = path.join(REPO, '.dev', 'e2e-home');

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed++;
    process.stdout.write(`  ok   ${name}\n`);
  } catch (e) {
    process.stdout.write(`  FAIL ${name}\n       ${e.message.split('\n')[0]}\n`);
    throw e;
  }
};

/**
 * Run the CLI as a CHILD PROCESS, not by importing it.
 *
 * The exit code is part of the contract this client advertises (a calling
 * agent branches on 2 vs 3 vs 4), and an in-process import cannot observe it.
 * `status` is captured rather than thrown on, because half of these cases are
 * expected failures.
 */
const cli = (args, { expectFail = false, env = {} } = {}) => {
  let stdout = '';
  let stderr = '';
  let status = 0;
  try {
    stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ORCA_TOOLS_HOME: HOME, ORCA_TOOLS_KEY: '', ORCA_TOOLS_BASE: '', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    status = e.status ?? 1;
    stdout = e.stdout || '';
    stderr = e.stderr || '';
  }
  if (!expectFail && status !== 0) {
    throw new Error(`${args.join(' ')} exited ${status}: ${stderr || stdout}`);
  }
  return { stdout, stderr, status };
};

const json = (args) => JSON.parse(cli([...args, '-j']).stdout);

/**
 * Which agent a run was booked to. Two reads, not a JOIN: tool_runs lives on
 * the LOG database and agents on the core one (separate instances in
 * production — no cross-instance JOIN).
 */
const runAgent = (runId) => {
  const agentId = mysql(`select agent_id from tool_runs where run_id='${runId}';`, LOG_DB);
  return mysql(`select concat(slug, '|', coalesce(monthly_budget_usd, 'NULL')) from agents where id=${Number(agentId)};`);
};

const main = async () => {
  fs.rmSync(HOME, { recursive: true, force: true });
  const up = await bringUp({ fresh: process.argv.includes('--fresh') || process.env.ORCA_E2E_FRESH === '1' });
  const base = ['--base', up.base];
  process.stdout.write('\nrunning the loop through the CLI\n');
  try {
    // NO KEY YET. Exit code 3 and a message that says what to do — this is
    // the first thing a new user sees, so it is asserted first.
    check('a missing key exits 3 with instructions', () => {
      const r = cli(['balance', ...base], { expectFail: true });
      assert.equal(r.status, 3);
      assert.match(r.stderr, /keys add/);
    });

    check('setup stores the key and verifies it against the server', () => {
      const out = cli(['setup', ...base, '-k', up.botKey]).stdout;
      assert.match(out, /\napi +1\./);
      // The client learns that this server is synchronous, rather than being
      // told: see /v1/tools/meta's capability object.
      assert.match(out, /\nasync +no/);
      assert.match(out, /wallet/);
    });

    check('the stored config is 0600 and holds the key', () => {
      const p = path.join(HOME, 'config.json');
      assert.equal((fs.statSync(p).mode & 0o777).toString(8), '600');
      assert.equal(JSON.parse(fs.readFileSync(p, 'utf8')).keys.main.key, up.botKey);
    });

    check('keys list never prints the key', () => {
      const out = cli(['keys', 'list']).stdout;
      assert.match(out, /main/);
      assert.ok(!out.includes(up.botKey), 'the full key must never be printed');
    });

    check('discover finds the tool, scores it and prices it', () => {
      const d = json(['discover', '-q', 'echo query', ...base]);
      const hit = d.results.find((r) => r.id === up.toolId);
      assert.ok(hit, `${up.toolId} not in ${JSON.stringify(d.results.map((r) => r.id))}`);
      assert.ok(hit.score > 0, 'a ranked result carries its rank');
      // Never probed: the server says so in its own word rather than guessing.
      assert.equal(typeof hit.health.verdict, 'string');
      assert.equal(hit.provider_label, 'Dev Mock', 'the BRAND, not the slug');
      assert.equal(hit.price.for_sale, true);
      assert.ok(Math.abs(hit.price.sell_usd - SELL_USD) < 1e-9, `sell_usd ${hit.price.sell_usd}`);
    });

    check('the human discover view prints the sell price', () => {
      const out = cli(['discover', '-q', 'echo query', ...base]).stdout;
      assert.match(out, new RegExp(`${up.toolId.replace('.', '\\.')} .*\\$${SELL_USD}/call`));
    });

    check('min_score filters', () => {
      const none = json(['discover', '-q', 'echo query', '-s', '999', ...base]);
      assert.equal(none.results.length, 0);
    });

    check('inspect returns the schema the run is validated against', () => {
      const t = json(['inspect', '-t', up.toolId, ...base]);
      assert.equal(t.input_schema.required[0], 'query');
      assert.equal(t.input_schema.additionalProperties, false);
    });

    check('an unknown tool exits 2 with a code', () => {
      const r = cli(['inspect', '-t', 'nope.nope', ...base], { expectFail: true });
      assert.equal(r.status, 2);
      assert.match(r.stderr, /\[tool_not_found\]|not found/);
    });

    const walletSql = `select wallet_quota from workspaces where id=${up.wsId};`;
    const walletBefore = Number(mysql(walletSql));
    let runId = '';

    check('run executes, returns the output and reports the cost', () => {
      const res = json(['run', '-t', up.toolId, '-i', '{"query":"e2e"}', ...base]);
      assert.equal(res.status, 'completed');
      assert.equal(res.output.echoed, 'e2e', 'the mock echoed our input back');
      assert.ok(Math.abs(res.billed_usd - SELL_USD) < 1e-9, `billed ${res.billed_usd}, sold at ${SELL_USD}`);
      runId = res.run_id;
      assert.ok(runId, 'a run has an id even though it is synchronous');
    });

    check('the upstream was called with the PLATFORM key, not ours', () => {
      // The mock 401s on a wrong key, so a completed run is itself the proof
      // that OrcaRouter injected the stored credential — the caller never had
      // it. The count confirms exactly one egress for one run (the tool is
      // loaded from Mongo, never probed, so nothing else has called it).
      assert.equal(up.mock.calls(), 1, `mock saw ${up.mock.calls()} calls`);
    });

    check('the wallet actually moved', () => {
      const after = Number(mysql(walletSql));
      assert.ok(after < walletBefore, `wallet ${walletBefore} → ${after}`);
    });

    check('the run is attributed to the agent the key is bound to', () => {
      assert.equal(runAgent(runId).split('|')[0], 'e2e-bot');
    });

    check('bad input is refused by the schema, exit 2', () => {
      const r = cli(['run', '-t', up.toolId, '-i', '{"nope":1}', ...base], {
        expectFail: true,
      });
      assert.equal(r.status, 2);
      assert.match(r.stderr, /bad_input/);
    });

    check('runs list shows it', () => {
      const l = json(['runs', 'list', ...base]);
      assert.ok(l.items.some((r) => r.run_id === runId));
    });

    check('runs get re-reads it by id, and says why the bodies are absent', () => {
      const g = json(['runs', 'get', '-r', runId, ...base]);
      assert.equal(g.run_id, runId);
      assert.equal(g.status, 'completed');
      // Bodies live in the workspace's Request Logs store, which this fresh
      // workspace has not turned on: the run is there, its output is not.
      assert.equal(g.payload_state, 'not_captured', `payload_state ${g.payload_state}`);
      const human = cli(['runs', 'get', '-r', runId, ...base]).stdout;
      assert.match(human, /Request Logs are off/);
    });

    check('-o writes the output and only the output', () => {
      const out = path.join(REPO, '.dev', 'e2e-out.json');
      fs.rmSync(out, { force: true });
      const r = cli(['run', '-t', up.toolId, '-i', '{"query":"to-file"}', '-o', out, ...base]);
      assert.match(r.stdout, /written to/);
      assert.match(r.stdout, /cost /, 'the cost summary still goes to stdout');
      const written = JSON.parse(fs.readFileSync(out, 'utf8'));
      assert.equal(written.echoed, 'to-file', 'the file is the tool output, parseable as-is');
    });

    check('balance answers with wallet and spendable', () => {
      const b = json(['balance', ...base]);
      assert.ok(b.wallet_usd > 0);
      assert.ok(b.spendable_usd > 0);
    });

    check('a wrong key is refused with the key layer\'s message, exit 2', () => {
      const r = cli(['balance', ...base], { env: { ORCA_TOOLS_KEY: 'sk-orca-doesnotexist' }, expectFail: true });
      assert.equal(r.status, 2);
      assert.doesNotMatch(r.stderr, /^HTTP 401/, 'the reason, not a bare status');
      assert.ok(r.stderr.trim().length > 0);
    });

    check('an unknown run ref is refused before anything is held', () => {
      const r = cli(['run', '-t', up.toolId, '-i', '{"query":"e2e"}', '--run-ref', 'no-such-ref', ...base], {
        expectFail: true,
      });
      assert.equal(r.status, 2);
      assert.match(r.stderr, /bad_input/);
    });

    check('meta reports what the server does not do', () => {
      const m = json(['meta', ...base]);
      assert.equal(m.capabilities.async, false);
      assert.equal(m.capabilities.run_stop, false);
      assert.equal(m.skill_url, '/.well-known/orca/tools/SKILL.md');
    });

    check('the published skill is served and points at this API', () => {
      const doc = execFileSync('curl', ['-sS', `${up.base}/.well-known/orca/tools/SKILL.md`], {
        encoding: 'utf8',
      });
      assert.match(doc, /^---\nname: orcarouter-tools/);
      assert.match(doc, /api\.orcarouter\.ai/);
    });

    // LAST, because it is the path the console's CLI tab and the skill both
    // promise ("a plain workspace key runs as the workspace's `cli` agent")
    // and the one most likely to be broken by a server-side key check.
    check('a plain (unbound) workspace key runs as the workspace cli agent', () => {
      const r = cli(['run', '-t', up.toolId, '-i', '{"query":"plain"}', '-j', ...base], {
        env: { ORCA_TOOLS_KEY: up.cliKey },
        expectFail: true,
      });
      assert.equal(r.status, 0, `exit ${r.status}: ${r.stderr.trim()}`);
      const res = JSON.parse(r.stdout);
      assert.equal(runAgent(res.run_id), 'cli|NULL', 'the implicit agent, created on first use with no budget of its own');
    });

    process.stdout.write(`\n${passed} checks passed\n`);
  } finally {
    await tearDown(up);
  }
};

main().catch((e) => {
  process.stderr.write(`\ne2e FAILED: ${e.message}\n`);
  process.exit(1);
});
