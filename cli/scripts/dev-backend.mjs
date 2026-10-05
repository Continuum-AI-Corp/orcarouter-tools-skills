#!/usr/bin/env node
/*
dev-backend.mjs — bring up a LOCAL OrcaRouter with one runnable tool, so the
CLI's end-to-end test exercises real money movement against a real server.

WHY THIS EXISTS AS A SCRIPT. The first version of this was done by hand in a
terminal and lived in /tmp; the OS wiped it and every step had to be
rediscovered. A test that needs a fixture nobody can rebuild is a test that
runs once.

WHAT IT BUILDS
  1. the server from a DETACHED WORKTREE of the OrcaRouter repo at
     $ORCA_O2_REF (default origin/main, fetched first) under .dev/o2 — the
     contract under test is what main serves, not whatever branch the
     checkout happens to be on
  2. a fresh deployment in DATABASES OF ITS OWN on the shared dev containers
     (MySQL `<prefix>` + `<prefix>_log`, Mongo `<prefix>`, two Redis db
     numbers; prefix $ORCA_E2E_DB, default `cli_e2e`). Containers are shared
     by every worktree and isolated by database name, so this script drops
     and recreates ONLY its own databases — never anything else on them
  3. a MOCK upstream on 127.0.0.1 — no third-party call, no real spend, and a
     deterministic response the assertions can match
  4. one tool pointed at that mock, written where production keeps tools: a
     MongoDB `tool_upstream_catalogs` document plus the upstream's encrypted
     key and sell rates in `tool_providers`
  5. a workspace with a wallet, and an API key that is NOT bound to an agent —
     the case the CLI ships for, so the e2e proves it rather than assuming it

NEEDS: go, git, mysql (client), redis-cli, openssl, curl on PATH, and the
shared MySQL 8 / Redis / MongoDB reachable on 127.0.0.1 (defaults: 33110,
63110, 27110 — the PR box's orcarouter-* containers through an SSH tunnel;
override with ORCA_E2E_MYSQL_HOST/PORT/USER/PASSWORD, ORCA_E2E_REDIS_PORT,
ORCA_E2E_MONGO_DSN, ORCA_E2E_REDIS_DBS="14,15").

WHAT IT DELIBERATELY DOES NOT DO
  - no real provider credentials, ever. A local e2e that spends money is a
    local e2e nobody runs twice.
  - no /tmp. See above.

LOCAL-ONLY SETTINGS, and why each is safe HERE and nowhere else:
  - `TOOL_ROUTER_DEV_ALLOW_LOOPBACK=1` — the egress guard refuses 127.0.0.1
    (SSRF), which is exactly where the mock lives. The server refuses it under
    release mode, hence GIN_MODE=debug.
  - the tool tables (`tool_runs` and friends) are created by the seed helper:
    the server's boot leaves them to ops DDL (model/tool_schema_deferred.go),
    and a throwaway database has no ops.
*/
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const DEV = path.join(REPO, '.dev');

export const PORT = Number(process.env.DEV_PORT || 3111);
export const MOCK_PORT = Number(process.env.DEV_MOCK_PORT || 3112);
export const BASE = `http://127.0.0.1:${PORT}`;
const O2 = process.env.ORCA_O2_REPO || path.resolve(REPO, '..', '..', 'OrcaRouter-O2');
const O2_REF = process.env.ORCA_O2_REF || 'origin/main';
const O2_TREE = path.join(DEV, 'o2');
const PREFIX = process.env.ORCA_E2E_DB || 'cli_e2e';
if (!/^[a-z][a-z0-9_]{0,40}$/.test(PREFIX)) throw new Error(`ORCA_E2E_DB must be a lowercase identifier, got ${PREFIX}`);
export const CORE_DB = PREFIX;
export const LOG_DB = `${PREFIX}_log`;
const MYSQL = {
  host: process.env.ORCA_E2E_MYSQL_HOST || '127.0.0.1',
  port: process.env.ORCA_E2E_MYSQL_PORT || '33110',
  user: process.env.ORCA_E2E_MYSQL_USER || 'root',
  password: process.env.ORCA_E2E_MYSQL_PASSWORD || 'orca',
};
const dsn = (db) =>
  `${MYSQL.user}:${MYSQL.password}@tcp(${MYSQL.host}:${MYSQL.port})/${db}?parseTime=true&charset=utf8mb4&loc=Local`;
const MONGO_DSN = process.env.ORCA_E2E_MONGO_DSN || 'mongodb://127.0.0.1:27110';
const MONGO_DB = PREFIX;
const REDIS_PORT = process.env.ORCA_E2E_REDIS_PORT || '63110';
// When the mysql / redis-cli clients are not installed on this machine, run
// them INSIDE the database containers instead (docker exec).
const MYSQL_CONTAINER = process.env.ORCA_E2E_MYSQL_CONTAINER || '';
const REDIS_CONTAINER = process.env.ORCA_E2E_REDIS_CONTAINER || '';
// Two db numbers this prefix owns on the shared Redis (main + tool router).
const [REDIS_DB, REDIS_TOOL_DB] = (process.env.ORCA_E2E_REDIS_DBS || '14,15').split(',').map((x) => x.trim());
// PREBUILT: the server and seed binaries were built elsewhere (remote-e2e.sh
// builds them on the box that runs the test, next to the databases) and the
// O2 revision they came from is passed in. Nothing is checked out or built.
const PREBUILT = process.env.ORCA_E2E_PREBUILT === '1';
const BIN = process.env.ORCA_E2E_BIN || path.join(DEV, 'orcarouter');
const SEED_BIN = process.env.ORCA_E2E_SEED_BIN || path.join(DEV, 'seed');
const LOG = path.join(DEV, 'server.log');

const BOOT_WAIT_SEC = Number(process.env.ORCA_E2E_BOOT_WAIT_SEC || 1800);
const TOOL_ID = 'devmock.echo';
const PROVIDER = 'devmock';
const PROVIDER_KEY = 'dev-mock-provider-key';
// Sell price = upstream_list_usd × sell_rate (tool_providers): 0.002 × 1.5.
export const SELL_USD = 0.003;

/** The manifest. ONE required field so a bad `-i` is a schema error, not a 200. */
const manifest = (mockBase) => `id: ${TOOL_ID}
version: 1
provider:
  name: ${PROVIDER}
  display_name: Dev Mock
  categories:
    - search
  base_url: ${mockBase}
  auth:
    scheme: header
    name: X-API-Key
  timeouts:
    request_ms: 5000
endpoint:
  method: POST
  path: /echo
  display_name: Echo Query
  summary: Returns the query it was given, for local end-to-end tests.
  input_schema:
    type: object
    additionalProperties: false
    required:
      - query
    properties:
      query:
        type: string
        description: Anything; it comes back in the response.
  usage: '{"units": 1}'
  output: resp
pricing:
  mode: per_call
  upstream_list_usd: 0.002
  # The mock reports no cost of its own. Without this the basis defaults to
  # \`wire\` and every run fails usage_contract ("usage.cost_usd missing").
  upstream_cost:
    basis: unknown
health:
  probe:
    input:
      query: ping
`;

/**
 * The tool's Mongo document content: an upstream file with the one manifest
 * under `tools:` (service/toolrouter/monidcatalog/document.go UpstreamFile).
 */
const upstreamFile = (mockBase) =>
  `version: 1\naggregator: ${PROVIDER}\ntools:\n` +
  manifest(mockBase)
    .trimEnd()
    .split('\n')
    .map((line, i) => (i === 0 ? `  - ${line}` : `    ${line}`))
    .join('\n') +
  '\n';

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait for a URL to answer, or fail with the log tail — never silently.
 *
 * Through CURL rather than fetch: the mock's certificate is self-signed, and
 * Node's fetch has no per-call way to accept that. `-k` is correct for a
 * loopback fixture and nowhere else.
 */
const waitFor = async (url, seconds = 60) => {
  for (let i = 0; i < seconds * 2; i++) {
    try {
      sh('curl', ['-sSk', '-o', '/dev/null', url]);
      return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  const tail = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').slice(-2000) : '(no log)';
  throw new Error(`${url} never came up. log tail:\n${tail}`);
};

/**
 * A self-signed cert for the mock, cached in .dev.
 *
 * The mock has to speak HTTPS because spec.validateProvider refuses any
 * base_url that is not `https://` — a manifest names the host a PLATFORM
 * credential is sent to, and http:// would put that key on the wire in the
 * clear. The dev egress hatch turns TLS VERIFICATION off (not TLS), which is
 * exactly what makes a self-signed cert workable here and nowhere else.
 */
const mockCert = () => {
  const key = path.join(DEV, 'mock-key.pem');
  const crt = path.join(DEV, 'mock-cert.pem');
  if (!fs.existsSync(key) || !fs.existsSync(crt)) {
    sh('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', crt, '-days', '365',
      '-subj', '/CN=127.0.0.1',
      '-addext', 'subjectAltName=IP:127.0.0.1',
    ]);
  }
  return { key, crt };
};

/**
 * The mock upstream, as a CHILD PROCESS.
 *
 * Not in-process: the e2e drives the CLI with execFileSync, which blocks the
 * event loop until the child exits — an in-process mock cannot answer the
 * request that CLI is making, and every run failed `provider_timeout`. See
 * mock-upstream.mjs.
 */
export const startMock = () => {
  const { key, crt } = mockCert();
  const out = fs.openSync(path.join(DEV, 'mock.log'), 'a');
  const child = spawn(process.execPath, [path.join(HERE, 'mock-upstream.mjs')], {
    env: {
      ...process.env,
      MOCK_PORT: String(MOCK_PORT),
      MOCK_KEY_FILE: key,
      MOCK_CERT_FILE: crt,
      MOCK_PROVIDER_KEY: PROVIDER_KEY,
    },
    stdio: ['ignore', out, out],
  });
  return {
    child,
    /** Read through curl: the caller is usually blocking its own loop. */
    calls: () => {
      try {
        const raw = sh('curl', ['-sSk', `https://127.0.0.1:${MOCK_PORT}/__calls`]);
        return JSON.parse(raw).calls;
      } catch {
        return -1;
      }
    },
  };
};

const env = () => ({
  ...process.env,
  SQL_DSN: dsn(CORE_DB),
  LOG_SQL_DSN: dsn(LOG_DB),
  REDIS_CONN_STRING: `redis://127.0.0.1:${REDIS_PORT}/${REDIS_DB}`,
  TOOL_ROUTER_REDIS_CONN_STRING: `redis://127.0.0.1:${REDIS_PORT}/${REDIS_TOOL_DB}`,
  PORT: String(PORT),
  // NOT release: platform.NewEgress REFUSES the loopback hatch under release
  // mode on purpose (a demo flag that leaked into production would turn the
  // provider gateway into an SSRF client), and main.go picks release unless
  // GIN_MODE is exactly `debug`. The mock lives on loopback.
  GIN_MODE: 'debug',
  SESSION_SECRET: 'dev-only-session-secret-0123456789',
  CRYPTO_SECRET: 'dev-only-crypto-secret-01234567890',
  SECRETS_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  // /v1/tools is registered, and the catalog loaded, only on a tool node.
  TOOL_ROUTER_NODE: 'true',
  TOOL_CATALOG_MONGO_DSN: MONGO_DSN,
  TOOL_CATALOG_MONGO_DB: MONGO_DB,
  REQUEST_LOG_MONGO_DSN: MONGO_DSN,
  REQUEST_LOG_MONGO_DB: MONGO_DB,
  TOOL_ROUTER_DEV_ALLOW_LOOPBACK: '1',
  TOOL_HEALTH_CACHE_TTL_SEC: '5',
});

/**
 * `slave: true` boots WITHOUT the master's migrations (main.go keys boot
 * migrations and master-only jobs on NODE_TYPE). /v1/tools is registered on
 * any node with TOOL_ROUTER_NODE, so the API under test is the same — and the
 * boot is seconds instead of a full AutoMigrate over the tunnel.
 */
const startServer = ({ slave = false } = {}) => {
  const out = fs.openSync(LOG, 'a');
  // cwd IS .dev: the server writes its own `logs/` directory relative to the
  // working directory, and a bare run from the repo root litters it there.
  const child = spawn(BIN, [], {
    env: { ...env(), ...(slave ? { NODE_TYPE: 'slave' } : {}) },
    cwd: DEV,
    stdio: ['ignore', out, out],
    detached: false,
  });
  child.unref();
  return child;
};

const stopServer = async (child) => {
  try {
    child.kill('SIGTERM');
  } catch {
    /* already gone */
  }
  await sleep(1500);
};

/**
 * The SQL leg. Two things only the database can do for an unattended script:
 * turn the module on, and mint credentials.
 *
 * Through the mysql CLI rather than a driver because this repo must not grow
 * a dependency to run its own tests. The password goes in MYSQL_PWD, not on
 * the command line, where `ps` would show it and the client would warn.
 */
export const mysql = (sql, db = CORE_DB) => {
  const args = ['-u', MYSQL.user, '-N', '-B', ...(db ? [db] : []), '-e', sql];
  if (MYSQL_CONTAINER) {
    return sh('docker', ['exec', '-e', `MYSQL_PWD=${MYSQL.password}`, MYSQL_CONTAINER, 'mysql', ...args]).trim();
  }
  return sh('mysql', ['-h', MYSQL.host, '-P', String(MYSQL.port), ...args], {
    env: { ...process.env, MYSQL_PWD: MYSQL.password },
  }).trim();
};

const flushRedis = () => {
  for (const n of [REDIS_DB, REDIS_TOOL_DB]) {
    if (REDIS_CONTAINER) sh('docker', ['exec', REDIS_CONTAINER, 'redis-cli', '-n', String(n), 'FLUSHDB']);
    else sh('redis-cli', ['-p', String(REDIS_PORT), '-n', String(n), 'FLUSHDB']);
  }
};

const q = (sql) => mysql(sql);

/**
 * Drop and recreate THIS PREFIX's databases, and only those: the containers
 * are shared with every other worktree and with the PR verification stack.
 */
const resetStores = () => {
  for (const db of [CORE_DB, LOG_DB]) {
    mysql(`DROP DATABASE IF EXISTS \`${db}\`; CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, '');
  }
  flushRedis();
  // Mongo is dropped by the seed helper, which already holds a client.
};

const bootstrapSQL = () => {
  // The Tool Router module itself (off by default: 503 tool_router_disabled).
  mysql(
    `INSERT INTO options (\`key\`, value) VALUES ('tools_setting.enabled','true')
     ON DUPLICATE KEY UPDATE value='true';`,
  );

  // A workspace with a wallet, owned by root. AgentQuotaForUSD is
  // quota-per-unit × usd; the platform default is 500000 per USD.
  const walletUsd = 5;
  const walletQuota = 500000 * walletUsd;
  let wsId = q(`SELECT id FROM workspaces WHERE owner_user_id=1 ORDER BY id LIMIT 1;`);
  if (!wsId) {
    mysql(
      `INSERT INTO workspaces (owner_user_id, name, wallet_quota, created_at, updated_at)
       VALUES (1, 'dev', ${walletQuota}, UNIX_TIMESTAMP(), UNIX_TIMESTAMP());`,
    );
    wsId = q(`SELECT id FROM workspaces WHERE owner_user_id=1 ORDER BY id DESC LIMIT 1;`);
  } else {
    mysql(`UPDATE workspaces SET wallet_quota=${walletQuota} WHERE id=${wsId};`);
  }
  // The key layer requires an ACTIVE membership of the key's workspace, and
  // the implicit `cli` agent is created for a member only.
  const member = q(`SELECT id FROM workspace_members WHERE workspace_id=${wsId} AND user_id=1 LIMIT 1;`);
  if (!member) {
    mysql(
      `INSERT INTO workspace_members (workspace_id, user_id, email, role, invited_by_user_id, invited_at, accepted_at)
       VALUES (${wsId}, 1, 'root@localhost', 'owner', 1, UNIX_TIMESTAMP(), UNIX_TIMESTAMP());`,
    );
  }

  // THE CLI'S KEY, deliberately UNBOUND (agent_id 0): the whole point of the
  // client is that a plain workspace key works.
  //
  // THE KEY FORMAT (middleware/auth.go, TokenAuth): the `sk-` prefix is
  // STRIPPED before the lookup, so the `key` column must NOT contain it; and a
  // key that does not begin `orca-` is SPLIT on `-` with only the first part
  // looked up — so `dev-abc123` resolves as `dev` and 401s. Hence the
  // platform's own `orca-` form, and no hyphens after it.
  const secret = 'orca-dev' + Math.random().toString(36).slice(2, 14).replace(/-/g, '');
  const cliKey = `sk-${secret}`;
  const cols = q(
    `SELECT GROUP_CONCAT(column_name) FROM information_schema.columns WHERE table_schema='${CORE_DB}' AND table_name='tokens';`,
  ).split(',');
  const has = (c) => cols.includes(c);
  const fields = ['user_id', 'key', 'name', 'status', 'created_time', 'accessed_time', 'expired_time', 'remain_quota', 'unlimited_quota'];
  const values = ['1', `'${secret}'`, `'dev-cli'`, '1', "UNIX_TIMESTAMP()", "UNIX_TIMESTAMP()", '-1', '0', '1'];
  if (has('workspace_id')) {
    fields.push('workspace_id');
    values.push(String(wsId));
  }
  if (has('agent_id')) {
    fields.push('agent_id');
    values.push('0');
  }
  mysql(
    `DELETE FROM tokens WHERE name='dev-cli';
     INSERT INTO tokens (${fields.map((f) => `\`${f}\``).join(',')}) VALUES (${values.join(',')});`,
  );

  // A SECOND key, BOUND to an agent of its own — the shape a console user
  // gets when they create a key for an agent. The e2e drives the main loop on
  // it and checks the unbound key separately, so a regression in either path
  // is named for what it is.
  mysql(
    `INSERT IGNORE INTO agents (workspace_id, name, name_key, slug, owner_user_id, status, budget_enforcement, created_at, updated_at)
     VALUES (${wsId}, 'E2E Bot', 'e2e-bot', 'e2e-bot', 1, 'active', 'alert_only', UNIX_TIMESTAMP(), UNIX_TIMESTAMP());`,
  );
  const agentId = q(`SELECT id FROM agents WHERE workspace_id=${wsId} AND slug='e2e-bot';`);
  const botSecret = 'orca-bot' + Math.random().toString(36).slice(2, 14).replace(/-/g, '');
  const botValues = values.slice();
  botValues[1] = `'${botSecret}'`;
  botValues[2] = `'dev-bot'`;
  if (has('agent_id')) botValues[fields.indexOf('agent_id')] = agentId;
  mysql(
    `DELETE FROM tokens WHERE name='dev-bot';
     INSERT INTO tokens (${fields.map((f) => `\`${f}\``).join(',')}) VALUES (${botValues.join(',')});`,
  );
  return { cliKey, botKey: `sk-${botSecret}`, agentId: Number(agentId), wsId: Number(wsId) };
};

/**
 * POST /api/setup — the first-run wizard, done over HTTP on purpose.
 *
 * It creates the root user AND the `setups` row that makes the deployment
 * consider itself initialised. Doing it in SQL would produce a user with no
 * setup record, which every later boot logs about and some routes treat as a
 * half-installed system.
 *
 * `self-use mode` is ON for a dev box: it turns off the public-facing
 * registration surfaces this script has no use for.
 */
const completeSetup = async () => {
  const res = await fetch(`${BASE}/api/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'root',
      password: 'devdevdev',
      confirmPassword: 'devdevdev',
      SelfUseModeEnabled: true,
      DemoSiteEnabled: false,
    }),
  });
  const body = await res.json().catch(() => null);
  // "already initialized" is fine — this script is re-runnable without --fresh.
  if (!body?.success && !String(body?.message || '').includes('already')) {
    throw new Error(`/api/setup failed: ${JSON.stringify(body)}`);
  }
};

/**
 * A detached worktree of the OrcaRouter repo at O2_REF, refreshed each run.
 * Detached and under .dev so the reader's own checkout — its branch, its
 * uncommitted work — is never touched.
 */
const prepareTree = () => {
  if (!fs.existsSync(path.join(O2, '.git'))) {
    throw new Error(`OrcaRouter repo not found at ${O2}. Set ORCA_O2_REPO to its path.`);
  }
  if (O2_REF.startsWith('origin/')) sh('git', ['-C', O2, 'fetch', '-q', 'origin']);
  if (!fs.existsSync(path.join(O2_TREE, '.git'))) {
    sh('git', ['-C', O2, 'worktree', 'add', '-q', '--detach', O2_TREE, O2_REF]);
  } else {
    sh('git', ['-C', O2_TREE, 'checkout', '-q', '--detach', O2_REF]);
  }
  // main.go embeds web/dist, which is a build output and not in git. The API
  // under test never serves it, so a placeholder page is enough to compile.
  const dist = path.join(O2_TREE, 'web', 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>e2e</title>\n');
  }
  const seedDir = path.join(O2_TREE, 'cmd', 'orca-cli-e2e-seed');
  fs.mkdirSync(seedDir, { recursive: true });
  fs.copyFileSync(path.join(HERE, 'e2e-seed.go'), path.join(seedDir, 'main.go'));
  return sh('git', ['-C', O2_TREE, 'rev-parse', '--short', 'HEAD']).trim();
};

/** Tool tables + the tool in Mongo, before the server boots and loads it. */
const seed = () => {
  const file = path.join(DEV, 'upstream.yaml');
  fs.writeFileSync(file, upstreamFile(`https://127.0.0.1:${MOCK_PORT}`));
  sh(SEED_BIN, [], {
    env: {
      ...env(),
      E2E_PROVIDER: PROVIDER,
      E2E_PROVIDER_KEY: PROVIDER_KEY,
      E2E_UPSTREAM_FILE: file,
      E2E_LOG_DSN: dsn(LOG_DB),
      E2E_MONGO_DSN: MONGO_DSN,
      E2E_MONGO_DB: MONGO_DB,
    },
  });
};

/**
 * The schema is REUSED between runs. A fresh MySQL migration over the SSH
 * tunnel is thousands of round trips (tens of minutes), so it runs only when
 * it has to: on `fresh`, on the first run, or when the O2 revision differs
 * from the one that last migrated these databases (a newer main may add
 * tables or columns). The stamp is written only after a migration AND setup
 * succeeded. Everything else the run depends on is re-seeded every time.
 */
const STAMP = path.join(DEV, `schema-${PREFIX}.rev`);

const schemaReady = (rev) => {
  if (!fs.existsSync(STAMP) || fs.readFileSync(STAMP, 'utf8').trim() !== rev) return false;
  try {
    return mysql(`SELECT COUNT(*) FROM users WHERE id=1;`) === '1';
  } catch {
    return false;
  }
};

export const bringUp = async ({ fresh = false } = {}) => {
  fs.mkdirSync(DEV, { recursive: true });
  fs.rmSync(LOG, { force: true });
  let rev;
  if (PREBUILT) {
    rev = process.env.ORCA_E2E_REV || 'prebuilt';
    process.stdout.write(`using the prebuilt server (${rev}) …\n`);
  } else {
    rev = prepareTree();
    process.stdout.write(`building the server from ${O2_REF} (${rev}) …\n`);
    sh('go', ['build', '-o', BIN, '.'], { cwd: O2_TREE, stdio: 'inherit' });
    sh('go', ['build', '-o', SEED_BIN, './cmd/orca-cli-e2e-seed'], { cwd: O2_TREE, stdio: 'inherit' });
  }

  if (fresh || !schemaReady(rev)) {
    // A stale stamp (older main) migrates IN PLACE; only --fresh or a first
    // run starts from empty databases.
    const migratedBefore = fs.existsSync(STAMP);
    fs.rmSync(STAMP, { force: true });
    if (fresh || !migratedBefore) resetStores();
    // MIGRATING BOOT (master). It does NOT create a root user: a fresh
    // deployment is "not set up" and waits for POST /api/setup, which is also
    // the only path that records the setup row — writing the user straight
    // into the database would leave the deployment believing it is
    // uninitialised forever.
    process.stdout.write(`migrating ${CORE_DB}/${LOG_DB} (master boot) …\n`);
    const t0 = Date.now();
    const child = startServer();
    await waitFor(`${BASE}/api/status`, BOOT_WAIT_SEC);
    await completeSetup();
    process.stdout.write(`  migrated in ${Math.round((Date.now() - t0) / 1000)}s\n`);
    await stopServer(child);
    fs.writeFileSync(STAMP, `${rev}\n`);
  } else {
    process.stdout.write(`reusing the ${CORE_DB}/${LOG_DB} schema migrated at ${rev} (--fresh to rebuild)\n`);
    flushRedis();
  }

  // The SQL leg comes AFTER setup, now that users exists and has row 1.
  process.stdout.write('seeding the tool, settings, workspace and keys …\n');
  seed();
  const creds = bootstrapSQL();

  const mock = startMock();
  await waitFor(`https://127.0.0.1:${MOCK_PORT}/__calls`);

  process.stdout.write('booting (slave: no migrations) …\n');
  const t1 = Date.now();
  const child = startServer({ slave: true });
  await waitFor(`${BASE}/api/status`, BOOT_WAIT_SEC);
  process.stdout.write(
    `  up in ${Math.round((Date.now() - t1) / 1000)}s — ${TOOL_ID} from Mongo ${MONGO_DB} ` +
      `(MySQL ${CORE_DB}/${LOG_DB}, Redis ${REDIS_DB},${REDIS_TOOL_DB}), upstream mock on :${MOCK_PORT}\n`,
  );

  return { ...creds, child, mock, toolId: TOOL_ID, base: BASE, rev };
};

export const tearDown = async (up) => {
  if (up?.mock?.child) {
    try {
      up.mock.child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  if (up?.child) await stopServer(up.child);
};

// Run directly: bring it up and leave it running, printing what the CLI needs.
if (process.argv[1] && process.argv[1].endsWith('dev-backend.mjs')) {
  const up = await bringUp({ fresh: process.argv.includes('--fresh') });
  process.stdout.write(
    [
      '',
      'local OrcaRouter is up',
      `  base       ${up.base}`,
      `  tool       ${up.toolId}`,
      `  cli key    ${up.cliKey}   (not bound to an agent)`,
      `  bot key    ${up.botKey}   (bound to agent e2e-bot)`,
      '',
      'point the CLI at it:',
      `  export ORCA_TOOLS_HOME=${path.join(DEV, 'cli-home')}`,
      `  node bin/orca-tools.js setup --base ${up.base} -k ${up.cliKey}`,
      '',
      'Ctrl-C to stop (the mock upstream stops with it).',
      '',
    ].join('\n'),
  );
  process.on('SIGINT', async () => {
    await tearDown(up);
    process.exit(0);
  });
  // Hold the process open for the child + mock.
  await new Promise(() => {});
}
