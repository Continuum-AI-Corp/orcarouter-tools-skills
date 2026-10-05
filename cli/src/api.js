/*
api.js — the HTTP layer, and the one place that knows the wire shape.

WHY IT IS ITS OWN FILE: every command has the same three failure modes (the
network, the envelope, the error code), and a client that handles them once is
the difference between "tool failed" and a message an agent can act on.

THE ENVELOPE. OrcaRouter answers `{"success": true, "data": …}` on the tool
plane and `{"success": false, "code": "…", "message": "…", "deny"?: …}` when it
refuses (a provider failure adds `outcome` / `retry_safe`, a held run
`firewall_approval_id`). Auth refusals happen BEFORE that envelope exists (they
come from the relay middleware) and carry `{"error": "agent_paused", …}` or
`{"error": {"message", "type", "code"}}` instead — so unwrap() has to accept
all three, or a bad key reports "HTTP 401" instead of why.
*/
import { resolveBase, activeKey } from './config.js';

/** How long a single request may take before we stop waiting. */
const DEFAULT_TIMEOUT_MS = 120_000;

export class ApiError extends Error {
  constructor(message, { status = 0, code = '', body = null, retryAfter = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

/** A missing key is its own class so `main` can print setup help, not a 401. */
export class NoKeyError extends Error {
  constructor() {
    super(
      'No API key configured. Add one with:\n' +
        '  orca-tools keys add -k <your-key> -l main\n' +
        'Create the key in your OrcaRouter console under API Keys.',
    );
    this.name = 'NoKeyError';
  }
}

/**
 * Unwrap the response body into data, or throw an ApiError that says why.
 *
 * The order matters: the `success:false` envelope is checked BEFORE the HTTP
 * status, because it carries the machine-readable `code` an agent branches on
 * (`insufficient_balance` is a different action from `bad_input`) while the
 * status alone is a category.
 */
const unwrap = (status, body, retryAfter = '') => {
  if (body && typeof body === 'object') {
    if (body.success === true) return body.data;
    if (body.success === false) {
      throw new ApiError(body.message || 'request refused', {
        status,
        code: body.code || '',
        body,
        retryAfter,
      });
    }
    // The pre-envelope auth refusals: {"error": "...", "reason": "..."}.
    if (typeof body.error === 'string') {
      throw new ApiError(body.reason ? `${body.error}: ${body.reason}` : body.error, {
        status,
        code: body.error,
        body,
        retryAfter,
      });
    }
    // The key layer's OpenAI-style shape: {"error": {"message", "type", "code"}}.
    // Its code is not a tool-router code, but it is still the part to branch on.
    if (body.error && typeof body.error === 'object') {
      throw new ApiError(body.error.message || `HTTP ${status}`, {
        status,
        code: typeof body.error.code === 'string' ? body.error.code : '',
        body,
        retryAfter,
      });
    }
  }
  if (status >= 400) {
    // 413 arrives with an empty body: say what it means rather than a number.
    const msg = status === 413 ? 'request body exceeds the 1 MiB cap' : `HTTP ${status}`;
    throw new ApiError(msg, { status, body, retryAfter });
  }
  // A 2xx that is not an envelope is a deployment serving something else on
  // this path (an HTML login page from the console host is the common one).
  throw new ApiError(
    'unexpected response shape — is --base pointing at the API host?',
    { status, body },
  );
};

/**
 * One request. `path` is relative to /v1/tools.
 *
 * A NETWORK failure is reported with the base URL in it: the single most
 * common setup mistake is pointing this at the console host or at a
 * dev server that is not running, and both surface here as ECONNREFUSED /
 * ENOTFOUND with no other clue.
 */
export const call = async (
  method,
  path,
  { body, base, timeoutMs = DEFAULT_TIMEOUT_MS, query, headers = {} } = {},
) => {
  const auth = activeKey();
  if (!auth) throw new NoKeyError();
  const root = resolveBase(base);
  const url = new URL(`${root}/v1/tools${path}`);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...headers,
        authorization: `Bearer ${auth.key}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new ApiError(`timed out after ${Math.round(timeoutMs / 1000)}s: ${method} ${url}`);
    }
    throw new ApiError(`cannot reach ${root}: ${e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 400) };
  }
  return unwrap(res.status, parsed, res.headers.get('retry-after') || '');
};

export const discover = (opts) =>
  call('POST', '/discover', {
    base: opts.base,
    body: {
      q: opts.q || '',
      ...(opts.limit ? { limit: opts.limit } : {}),
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.minScore != null ? { min_score: opts.minScore } : {}),
      ...(opts.includeUnavailable ? { include_unavailable: true } : {}),
    },
  });

export const inspect = (id, opts = {}) =>
  call('GET', `/${encodeURIComponent(id)}`, { base: opts.base });

/**
 * A run. The three optional extras are all RETRY or ENVELOPE inputs the server
 * hands out, never values a caller invents: `approvalId` answers a
 * policy_declined deny's approval_id, `firewallApprovals` a held run's
 * firewall_approval_id, and `runRef` names a run budget the operator already
 * declared (an unknown ref is refused before any hold).
 */
export const run = (id, input, opts = {}) => {
  const headers = {};
  if (opts.runRef) headers['x-orca-run-ref'] = opts.runRef;
  if (opts.firewallApprovals?.length) {
    headers['x-orcarouter-firewall-approval'] = opts.firewallApprovals.join(',');
  }
  return call('POST', `/${encodeURIComponent(id)}/run`, {
    base: opts.base,
    body: { input, ...(opts.approvalId != null ? { approval_id: opts.approvalId } : {}) },
    timeoutMs: opts.timeoutMs,
    headers,
  });
};

export const getRun = (runId, opts = {}) =>
  call('GET', `/runs/${encodeURIComponent(runId)}`, { base: opts.base });

export const listRuns = (opts = {}) =>
  call('GET', '/runs', {
    base: opts.base,
    query: { status: opts.status, tool_id: opts.toolId, page: opts.page, size: opts.size },
  });

export const balance = (opts = {}) =>
  call('GET', '/balance', {
    base: opts.base,
    headers: opts.runRef ? { 'x-orca-run-ref': opts.runRef } : {},
  });

export const meta = (opts = {}) => call('GET', '/meta', { base: opts.base });
