#!/usr/bin/env node
/*
orca-tools — the CLI the skill documents.

WHY A CLI AND NOT "JUST CURL". The skill's job is to make an agent reach for
this instead of writing a scraper, and an agent will not reach for a five-line
curl with a bearer header, a JSON body and an envelope to unwrap. A command
per verb is one line each with no room to get the auth wrong.

WHY THE COMMAND SHAPE MATCHES THE REFERENCE (monid). Agents have read that
skill; a second directory with the same job and different flags costs them a
re-read for nothing. So: `discover -q`, `inspect -t`, `run -t -i`, `runs
list|get`, `balance`, `keys add|list|activate|remove`, `setup`, `-j` for JSON.

WHERE IT DELIBERATELY DIFFERS, because the server does:

  - a tool is ONE id (`exa.search`), not provider + endpoint. Our ids are
    stable and discover hands them back, so `-p x -e /y` would be two flags
    for one value;
  - `run` is SYNCHRONOUS — it returns the finished output, so there is no
    `--wait`, no polling loop and no `runs stop`. `runs get` re-reads a run
    you already made. `meta` reports this (`async: false`) so a client can
    tell without being told;
  - path/query parameters are part of the ONE input object, validated against
    the schema `inspect` prints. There is no `--path` / `--query`.

EXIT CODES are the contract for a caller that does not read English:
  0 ok · 1 usage · 2 refused by the server (bad input, budget, policy) ·
  3 no key configured · 4 the server could not be reached.
*/
import fs from 'node:fs';
import * as api from '../src/api.js';
import { ApiError, NoKeyError } from '../src/api.js';
import * as cfg from '../src/config.js';
import * as R from '../src/render.js';

const EXIT_OK = 0;
const EXIT_USAGE = 1;
const EXIT_REFUSED = 2;
const EXIT_NO_KEY = 3;
const EXIT_UNREACHABLE = 4;

const USAGE = `orca-tools — discover, inspect and run pay-per-call tools through OrcaRouter

  orca-tools discover -q <query> [-l <limit>] [-s <minScore>] [-c <category>] [-u]
  orca-tools discover -g <routeGroup> [-q <query>] [-u]
  orca-tools inspect  -t <toolId>
  orca-tools run      -t <toolId> (-i <json> | -f <file>) [-o <outFile>]
                      [--run-ref <ref>] [--approval-id <n>] [--firewall-approval <id>]
  orca-tools runs list [--status <s>] [--tool <id>] [--page <n>] [--size <n>]
  orca-tools runs get  -r <runId> [-o <outFile>]
  orca-tools balance [--run-ref <ref>]
  orca-tools meta
  orca-tools setup [--base <url>] [-k <key>]
  orca-tools keys add -k <key> -l <label> [--base <url>] | keys list | keys activate -l <label> | keys remove -l <label>

Global: -j/--json raw JSON · --base <url> override the API host

-g lists the tools of one route group (a tool's route_group): the
alternatives to try, in an order YOU choose, when a tool failed or found nothing.

--run-ref only names a run budget your operator already declared; an unknown
ref is refused. --approval-id / --firewall-approval are the ids a refusal
printed, presented on the RETRY of the same run once a human approved it.

The API host is https://api.orcarouter.ai (NOT the console host). Point it
somewhere else with --base, $ORCA_TOOLS_BASE, or once via 'setup --base'.`;

/**
 * A flag parser rather than a dependency.
 *
 * Deliberate: this ships inside a skill an agent installs, and a lockfile with
 * a transitive tree is a supply-chain surface for a program whose whole job is
 * to hold an API key. Everything below is Node built-ins.
 *
 * `--k=v` and `-k v` both work because both get typed at it.
 */
const parseArgs = (argv) => {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('-')) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq > 0) {
      out.flags[a.slice(0, eq).replace(/^-+/, '')] = a.slice(eq + 1);
      continue;
    }
    const name = a.replace(/^-+/, '');
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('-')) {
      out.flags[name] = next;
      i++;
    } else {
      out.flags[name] = true;
    }
  }
  return out;
};

const flag = (f, ...names) => {
  for (const n of names) {
    if (f[n] !== undefined) return f[n];
  }
  return undefined;
};

const num = (v) => {
  if (v === undefined || v === true) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** print + optional file. `-o` exists because outputs are big and reused. */
const emit = (text, outPath) => {
  if (outPath && typeof outPath === 'string') {
    fs.writeFileSync(outPath, text.endsWith('\n') ? text : text + '\n');
    process.stdout.write(`written to ${outPath}\n`);
    return;
  }
  process.stdout.write(text.endsWith('\n') ? text : text + '\n');
};

const show = (data, human, f) =>
  emit(f.j || f.json ? JSON.stringify(data, null, 2) : human, flag(f, 'o', 'out'));

/**
 * The run input. `-i` for inline JSON, `-f` for a file.
 *
 * BOTH REFUSE NON-OBJECTS, and that refusal is worth the code: the server
 * validates against the tool's schema, so a bare string or array would come
 * back as a schema error that reads like the TOOL is wrong. Saying it here
 * names the actual mistake.
 */
const readInput = (f) => {
  const inline = flag(f, 'i', 'input');
  const file = flag(f, 'f', 'file');
  let raw;
  if (typeof file === 'string') {
    raw = fs.readFileSync(file, 'utf8');
  } else if (typeof inline === 'string') {
    raw = inline;
  } else {
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new UsageError(`input is not valid JSON: ${e.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UsageError('input must be a JSON OBJECT of the tool\'s parameters');
  }
  return parsed;
};

class UsageError extends Error {}

const cmdDiscover = async (f) => {
  const q = flag(f, 'q', 'query');
  const g = flag(f, 'g', 'route-group');
  const routeGroup = typeof g === 'string' ? g : '';
  const data = await api.discover({
    base: flag(f, 'base'),
    q: typeof q === 'string' ? q : '',
    limit: num(flag(f, 'l', 'limit')),
    category: typeof flag(f, 'c', 'category') === 'string' ? flag(f, 'c', 'category') : undefined,
    routeGroup: routeGroup || undefined,
    minScore: num(flag(f, 's', 'min-score')),
    includeUnavailable: Boolean(flag(f, 'u', 'include-unavailable')),
  });
  show(data, R.renderDiscover(data.results || [], routeGroup), f);
};

const cmdInspect = async (f) => {
  const id = flag(f, 't', 'tool', 'id');
  if (typeof id !== 'string') throw new UsageError('inspect needs -t <toolId>');
  const data = await api.inspect(id, { base: flag(f, 'base') });
  show(data, R.renderInspect(data), f);
};

const cmdRun = async (f) => {
  const id = flag(f, 't', 'tool', 'id');
  if (typeof id !== 'string') throw new UsageError('run needs -t <toolId>');
  const input = readInput(f);
  const approval = flag(f, 'approval-id');
  let approvalId;
  if (approval !== undefined) {
    approvalId = Number(approval);
    if (!Number.isInteger(approvalId) || approvalId <= 0) {
      throw new UsageError('--approval-id takes the positive integer a policy_declined refusal printed');
    }
  }
  const fw = flag(f, 'firewall-approval');
  const runRef = flag(f, 'run-ref');
  const data = await api.run(id, input, {
    base: flag(f, 'base'),
    timeoutMs: num(flag(f, 'timeout')) ? num(flag(f, 'timeout')) * 1000 : undefined,
    approvalId,
    firewallApprovals:
      typeof fw === 'string' ? fw.split(',').map((x) => x.trim()).filter(Boolean) : undefined,
    runRef: typeof runRef === 'string' && runRef.trim() ? runRef.trim() : undefined,
  });
  // The OUTPUT goes to the file when -o is given; the cost summary still goes
  // to stdout. Writing the summary into the results file would corrupt a file
  // the next step parses as JSON.
  const outPath = flag(f, 'o', 'out');
  if (typeof outPath === 'string') {
    fs.writeFileSync(outPath, JSON.stringify(data.output ?? null, null, 2) + '\n');
    process.stdout.write(`${R.renderRun(data).split('\n\noutput:')[0]}\noutput    written to ${outPath}\n`);
    return;
  }
  show(data, R.renderRun(data), { ...f, o: undefined, out: undefined });
};

const cmdRuns = async (f, rest) => {
  const sub = rest[0] || 'list';
  if (sub === 'get') {
    const runId = flag(f, 'r', 'run');
    if (typeof runId !== 'string') throw new UsageError('runs get needs -r <runId>');
    const data = await api.getRun(runId, { base: flag(f, 'base') });
    const outPath = flag(f, 'o', 'out');
    if (typeof outPath === 'string') {
      fs.writeFileSync(outPath, JSON.stringify(data.output ?? null, null, 2) + '\n');
      process.stdout.write(`${R.renderRun(data).split('\n\noutput:')[0]}\noutput    written to ${outPath}\n`);
      return;
    }
    show(data, R.renderRun(data), { ...f, o: undefined, out: undefined });
    return;
  }
  if (sub !== 'list') throw new UsageError(`unknown 'runs' subcommand: ${sub}`);
  const data = await api.listRuns({
    base: flag(f, 'base'),
    status: typeof flag(f, 'status') === 'string' ? flag(f, 'status') : undefined,
    toolId: typeof flag(f, 'tool') === 'string' ? flag(f, 'tool') : undefined,
    page: num(flag(f, 'page')),
    size: num(flag(f, 'size')),
  });
  show(data, R.renderRuns(data), f);
};

const cmdBalance = async (f) => {
  const runRef = flag(f, 'run-ref');
  const data = await api.balance({
    base: flag(f, 'base'),
    runRef: typeof runRef === 'string' && runRef.trim() ? runRef.trim() : undefined,
  });
  show(data, R.renderBalance(data), f);
};

const cmdMeta = async (f) => {
  const data = await api.meta({ base: flag(f, 'base') });
  const caps = Object.entries(data.capabilities || {})
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');
  show(
    data,
    `api       ${data.api_version}\nskill     ${data.skill_url}\ncapabilities:\n${caps}`,
    f,
  );
};

/**
 * `keys` is entirely LOCAL — no request, no server-side key registry.
 *
 * Which is why `keys add` cannot tell you the key is wrong: it stores what it
 * is given. `setup` below is what makes the one call that can.
 */
const cmdKeys = (f, rest) => {
  const sub = rest[0];
  const c = cfg.load();
  if (sub === 'add') {
    const key = flag(f, 'k', 'key');
    const label = flag(f, 'l', 'label') || 'main';
    if (typeof key !== 'string' || !key.trim()) throw new UsageError('keys add needs -k <key>');
    c.keys[String(label)] = { key: key.trim(), added_at: new Date().toISOString() };
    // The FIRST key is activated automatically: a stored key nothing selects
    // is a config that looks done and does not work.
    if (!c.active) c.active = String(label);
    // `--base` is STORED here, not just honoured for this call: the console's
    // self-hosted snippet is `keys add … --base <url>`, and a key saved
    // without its host would silently be sent to the hosted API next time.
    const base = flag(f, 'base');
    if (typeof base === 'string' && base.trim()) c.base = base.trim().replace(/\/+$/, '');
    const p = cfg.save(c);
    emit(
      `stored key "${label}"${c.active === String(label) ? ' (active)' : ''} in ${p}` +
        (c.base ? `\nbase      ${c.base}` : ''),
    );
    return;
  }
  if (sub === 'list') {
    const rows = Object.entries(c.keys).map(([label, v]) => [
      label === c.active ? `* ${label}` : `  ${label}`,
      // The key is NEVER printed, not even truncated-but-long: this output
      // lands in agent transcripts and CI logs. The last four is enough to
      // tell two keys apart, which is all this list is for.
      `…${String(v.key || '').slice(-4)}`,
      v.added_at || '',
    ]);
    emit(rows.length ? R.table(['LABEL', 'KEY', 'ADDED'], rows) : 'No keys configured.');
    return;
  }
  if (sub === 'activate') {
    const label = String(flag(f, 'l', 'label') || '');
    if (!c.keys[label]) throw new UsageError(`no key labelled "${label}"`);
    c.active = label;
    cfg.save(c);
    emit(`active key is now "${label}"`);
    return;
  }
  if (sub === 'remove') {
    const label = String(flag(f, 'l', 'label') || '');
    if (!c.keys[label]) throw new UsageError(`no key labelled "${label}"`);
    delete c.keys[label];
    if (c.active === label) c.active = Object.keys(c.keys)[0] || null;
    cfg.save(c);
    emit(`removed "${label}"${c.active ? `; active is now "${c.active}"` : ''}`);
    return;
  }
  throw new UsageError("keys takes: add | list | activate | remove");
};

/**
 * `setup` is the one command that VERIFIES.
 *
 * It stores the base (and a key if given) and then calls /meta and /balance —
 * the two cheapest reads — so the reader learns now, not on their first paid
 * run, that the host is wrong or the key is not accepted. It is also where a
 * client discovers what this server supports (see meta's capabilities).
 */
const cmdSetup = async (f) => {
  const c = cfg.load();
  const base = flag(f, 'base');
  if (typeof base === 'string' && base.trim()) c.base = base.trim().replace(/\/+$/, '');
  const key = flag(f, 'k', 'key');
  if (typeof key === 'string' && key.trim()) {
    const label = String(flag(f, 'l', 'label') || 'main');
    c.keys[label] = { key: key.trim(), added_at: new Date().toISOString() };
    if (!c.active) c.active = label;
  }
  const path = cfg.save(c);
  const resolved = cfg.resolveBase(undefined, c);
  const lines = [`config    ${path}`, `base      ${resolved}`];
  const auth = cfg.activeKey(c);
  if (!auth) {
    lines.push('key       none — add one with: orca-tools keys add -k <key> -l main');
    emit(lines.join('\n'));
    return;
  }
  lines.push(`key       ${auth.source}`);
  const m = await api.meta({ base });
  lines.push(`api       ${m.api_version}`);
  lines.push(`async     ${m.capabilities?.async ? 'yes' : 'no — run returns the finished output'}`);
  const b = await api.balance({ base });
  lines.push(`wallet    ${R.usd(b.wallet_usd)}`);
  if (b.spendable_usd != null) lines.push(`spendable ${R.usd(b.spendable_usd)}`);
  lines.push('');
  lines.push('Ready. Start with:  orca-tools discover -q "what you need"');
  emit(lines.join('\n'));
};

const main = async () => {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    emit(USAGE);
    return EXIT_OK;
  }
  if (argv[0] === '--version' || argv[0] === 'version') {
    const pkg = JSON.parse(
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    emit(pkg.version);
    return EXIT_OK;
  }
  const [cmd, ...rest] = argv;
  const parsed = parseArgs(rest);
  const f = parsed.flags;
  try {
    switch (cmd) {
      case 'discover':
        await cmdDiscover(f);
        break;
      case 'inspect':
        await cmdInspect(f);
        break;
      case 'run':
        await cmdRun(f);
        break;
      case 'runs':
        await cmdRuns(f, parsed._);
        break;
      case 'balance':
        await cmdBalance(f);
        break;
      case 'meta':
        await cmdMeta(f);
        break;
      case 'keys':
        cmdKeys(f, parsed._);
        break;
      case 'setup':
        await cmdSetup(f);
        break;
      default:
        process.stderr.write(`unknown command: ${cmd}\n\n${USAGE}\n`);
        return EXIT_USAGE;
    }
    return EXIT_OK;
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`${e.message}\n`);
      return EXIT_USAGE;
    }
    if (e instanceof NoKeyError) {
      process.stderr.write(`${e.message}\n`);
      return EXIT_NO_KEY;
    }
    if (e instanceof ApiError) {
      // The CODE goes first when there is one: it is the part a calling agent
      // branches on, and burying it after prose means it gets summarised away.
      const code = e.code ? `[${e.code}] ` : '';
      // With -j the refusal body goes out whole, so a caller can read deny /
      // outcome / retry_safe without parsing the prose below.
      if ((f.j || f.json) && e.body && typeof e.body === 'object') {
        process.stderr.write(`${JSON.stringify(e.body, null, 2)}\n`);
      } else {
        const details = R.renderErrorDetails(e.body, e.retryAfter);
        process.stderr.write(`${code}${e.message}${details.length ? `\n${details.join('\n')}` : ''}\n`);
      }
      return e.status ? EXIT_REFUSED : EXIT_UNREACHABLE;
    }
    process.stderr.write(`${e?.stack || e}\n`);
    return EXIT_REFUSED;
  }
};

main().then((code) => process.exit(code));
