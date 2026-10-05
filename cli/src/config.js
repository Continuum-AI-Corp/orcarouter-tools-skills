/*
config.js — where the key and the base URL live, and nothing else.

ONE FILE, 0600, UNDER $HOME. The alternative (an env var the user exports in a
shell profile) puts a live credential in a file every process inherits and
every `env` dump prints; the alternative to THAT (asking each time) makes the
tool unusable from an agent. `ORCA_TOOLS_KEY` is still honoured because CI has
no home directory worth writing to, and it takes precedence — an explicit
value in the environment is a deliberate act, a file is a leftover.

MULTIPLE KEYS, ONE ACTIVE. A person with a work workspace and a personal one
switches between them; a single stored key would make that a re-paste every
time. The label is theirs, not derived from the key, because two keys of the
same workspace look identical from here.
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The hosted deployment's API host. NOT the console host, which serves no /v1. */
export const DEFAULT_BASE = 'https://api.orcarouter.ai';

export const configDir = () =>
  process.env.ORCA_TOOLS_HOME || path.join(os.homedir(), '.orca-tools');

const configPath = () => path.join(configDir(), 'config.json');

const empty = () => ({ version: 1, active: null, keys: {}, base: null });

/**
 * Read the config, tolerating every shape a half-written file can have.
 *
 * A corrupt file must NOT be fatal: the CLI's whole job is to be reachable
 * from an agent that cannot see a stack trace, and "your config is invalid"
 * with no way forward is worse than starting over — `keys add` rewrites it
 * anyway. The parse failure is silent for the same reason it is tolerated.
 */
export const load = () => {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty();
    return {
      version: 1,
      active: typeof parsed.active === 'string' ? parsed.active : null,
      keys: parsed.keys && typeof parsed.keys === 'object' ? parsed.keys : {},
      base: typeof parsed.base === 'string' ? parsed.base : null,
    };
  } catch {
    return empty();
  }
};

/**
 * Write the config with the file mode set at CREATE time.
 *
 * `mode` on writeFileSync only applies when the file does not exist, so an
 * existing 0644 file would keep its mode — hence the explicit chmod. A
 * credential file the rest of the machine can read is the failure this
 * function exists to prevent, so the chmod is not best-effort.
 */
export const save = (cfg) => {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = configPath();
  fs.writeFileSync(p, JSON.stringify({ ...cfg, version: 1 }, null, 2) + '\n', {
    mode: 0o600,
  });
  fs.chmodSync(p, 0o600);
  return p;
};

/**
 * The key this invocation should use, and where it came from.
 *
 * The `source` is returned because every error about a wrong key has to be
 * actionable: "the key from your environment" and "the key labelled work" send
 * the reader to different places.
 */
export const activeKey = (cfg = load()) => {
  const fromEnv = (process.env.ORCA_TOOLS_KEY || '').trim();
  if (fromEnv) return { key: fromEnv, label: null, source: 'ORCA_TOOLS_KEY' };
  const label = cfg.active;
  if (!label) return null;
  const key = cfg.keys?.[label]?.key;
  if (!key) return null;
  return { key, label, source: `key "${label}"` };
};

/**
 * The base URL for this invocation.
 *
 * Precedence is flag > env > stored > default, which is the order of how
 * deliberate each one is. Trailing slashes are stripped here rather than at
 * every call site, because `${base}/v1/tools` with a stored trailing slash
 * produces a double slash that some proxies 404 and others silently accept —
 * the kind of difference that only shows up in the deployment you cannot
 * debug.
 */
export const resolveBase = (flag, cfg = load()) => {
  const raw =
    (flag || '').trim() ||
    (process.env.ORCA_TOOLS_BASE || '').trim() ||
    (cfg.base || '').trim() ||
    DEFAULT_BASE;
  return raw.replace(/\/+$/, '');
};
