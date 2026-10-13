/*
render.js — the human-readable output.

WHY IT IS NOT JSON BY DEFAULT. The reader is usually a coding agent with a
context budget: a discover response is ~1.5 KB of JSON per result, and ten of
them is most of a page for information that fits in ten lines. `-j` gives the
raw envelope for anything that wants to parse.

NO COLOUR, EVER. This output is read out of a captured stdout by an agent more
often than by an eye, and ANSI codes in a transcript are noise that changes
what a string match sees. The reference CLI needs NO_COLOR=1 for exactly this
reason; not emitting colour in the first place is the same fix without the
flag.
*/

/** A price with enough digits to be true: many tools cost $0.0005. */
export const usd = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '$0';
  if (v >= 1) return `$${v.toFixed(2)}`;
  const digits = Math.min(6, Math.max(2, -Math.floor(Math.log10(Math.abs(v))) + 2));
  return `$${v.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')}`;
};

/**
 * `per_result` prices are per RESULT: saying so is a cost warning in 8 chars.
 *
 * `sell_usd` is the whole price (nothing is added on top). `for_sale: false`
 * means nobody priced the tool yet and a run answers `tool_unpriced`, so it
 * prints as that rather than as a dash a reader could take for "free".
 */
export const priceLine = (price) => {
  if (!price) return '—';
  if (price.for_sale === false) return 'not for sale';
  const unit = price.mode === 'per_call' || !price.unit ? 'call' : price.unit;
  return `${usd(price.sell_usd)}/${unit}`;
};

/**
 * The health column: the verdict word plus the median run time when known.
 *
 * `unknown` prints as `unknown` rather than blank — a blank column invites the
 * reader to assume the tool is fine, and the whole point of the word is that
 * nobody has checked. See the skill's rule: break ties with health, never
 * filter on it.
 */
export const healthLine = (health) => {
  if (!health) return 'unknown';
  const verdict = health.verdict || 'unknown';
  const p50 = Number(health.p50_ms);
  if (!Number.isFinite(p50) || p50 <= 0) return verdict;
  return `${verdict} ${p50 >= 1000 ? `${(p50 / 1000).toFixed(1)}s` : `${Math.round(p50)}ms`}`;
};

const pad = (s, n) => {
  const str = String(s ?? '');
  return str.length >= n ? str : str + ' '.repeat(n - str.length);
};

/**
 * A left-aligned table with a fixed column order.
 *
 * Column widths come from the DATA, not from constants, because a tool id is
 * 12 characters for one provider and 60 for another and a truncated id is not
 * copy-pasteable into the next command — which is the only thing the reader
 * does with it.
 */
export const table = (headers, rows) => {
  if (!rows.length) return '';
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)),
  );
  const line = (cells) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? String(c ?? '') : pad(c, widths[i])))
      .join('  ')
      .trimEnd();
  return [line(headers), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
};

/**
 * A tool's route group with how many OTHER live tools share it, or '' when it
 * has no known substitute. The count is what makes the column worth reading:
 * "+0" says the group exists but nothing else in it can be run right now.
 */
export const groupLine = (r) =>
  r?.route_group ? `${r.route_group} (+${Number(r.alternatives ?? 0)})` : '';

export const renderDiscover = (results, routeGroup) => {
  if (!results?.length) {
    return routeGroup
      ? `No live tools in route group ${routeGroup}. Check the name against a tool's route_group, or add -u to include unavailable ones.`
      : 'No tools matched. Try fewer words, or a noun phrase ("tiktok posts", "company funding").';
  }
  // The GROUP column only when some result has one: most searches return
  // tools without a substitute, and an always-empty column is noise.
  const grouped = results.some((r) => r.route_group);
  const rows = results.map((r) => [
    r.id,
    r.display_name || '',
    r.provider_label || r.provider || '',
    priceLine(r.price),
    healthLine(r.health),
    ...(grouped ? [groupLine(r)] : []),
    r.score == null ? '' : Number(r.score).toFixed(1),
  ]);
  const headers = ['ID', 'NAME', 'UPSTREAM', 'PRICE', 'HEALTH', ...(grouped ? ['GROUP'] : []), 'SCORE'];
  const foot = routeGroup
    ? `\n\n${results.length} tool(s) in ${routeGroup}, in catalog order — NOT a ranking. ` +
      `Pick by the inputs you have, then health, then price; keep your own list of what you ran.\n` +
      `  orca-tools inspect -t ${results[0].id}`
    : `\n\n${results.length} result(s). Inspect one before running it:\n` +
      `  orca-tools inspect -t ${results[0].id}`;
  return table(headers, rows) + foot;
};

/**
 * The inspect view. The SCHEMA is the point of this command, so it is printed
 * in full and last — everything above it is one line each so the schema is
 * what survives a scroll.
 */
export const renderInspect = (tool) => {
  const out = [];
  out.push(`${tool.display_name || tool.id}`);
  out.push(`id        ${tool.id}`);
  out.push(`upstream  ${tool.provider_label || tool.provider || '—'}`);
  if (tool.summary) out.push(`about     ${tool.summary}`);
  if (tool.endpoint) {
    out.push(`endpoint  ${tool.endpoint.method} ${tool.endpoint.base_url}${tool.endpoint.path}`);
  }
  out.push(`price     ${priceLine(tool.price)}`);
  if (tool.price?.est_usd_for) {
    const e = tool.price.est_usd_for;
    out.push(`estimate  ${usd(e.usd)} for ${e.units} unit(s) — what a run of this size holds`);
  }
  out.push(`health    ${healthLine(tool.health)}`);
  out.push(`tier      ${tool.tier || '—'}`);
  out.push(`retryable ${tool.idempotent ? 'yes (idempotent)' : 'no — a timeout may have already run'}`);
  if (tool.route_group) {
    out.push(`group     ${groupLine(tool)} — alternatives: orca-tools discover -g ${tool.route_group}`);
  }
  if (tool.data_class) out.push(`data      ${tool.data_class}`);
  out.push('');
  out.push('input schema (build your -i JSON from THIS, never from memory):');
  out.push(JSON.stringify(tool.input_schema ?? {}, null, 2));
  return out.join('\n');
};

/**
 * After a run: what came back, and what it cost.
 *
 * THE COST IS PRINTED EVERY TIME, above the output. `billed_usd` is what the
 * workspace actually paid (the quote is only the hold), and an agent that does
 * not report it leaves its operator to find the spend in a dashboard later.
 * `budget` is decoration the server omits when it could not read it, so an
 * absent figure prints nothing rather than a zero.
 */
export const renderRun = (res) => {
  const head = [
    `status    ${res.status || 'completed'}`,
    `run id    ${res.run_id || '—'}`,
    `cost      ${costLine(res)}`,
  ];
  if (res.units) head.push(`units     ${res.units}`);
  const left = res.budget?.agent_month_left_usd;
  if (left != null) head.push(`budget    ${usd(left)} left this period`);
  if (res.sandbox) head.push('NOTE      sandbox agent: simulated, never sent to the provider, never billed');
  if (res.sanitized) head.push('NOTE      the output was sanitized by a firewall rule');
  if (res.output_error) head.push(`NOTE      the output hook failed: ${res.output_error}`);
  if (res.zdr) head.push('NOTE      ZDR workspace: nothing was retained server-side');
  if (res.error_code) head.push(`error     ${res.error_code}${res.error ? `: ${res.error}` : ''}`);
  const why = PAYLOAD_STATES[res.payload_state];
  if (why) head.push(`NOTE      no stored input/output: ${why}`);
  if (res.output_truncated) head.push('NOTE      the stored output was cut at the capture cap');
  return `${head.join('\n')}\n\noutput:\n${JSON.stringify(res.output ?? null, null, 2)}`;
};

/**
 * `runs get` reads a run's bodies from the workspace's Request Logs store, not
 * from the run row, and `payload_state` says why they are absent. A bare
 * `output: null` would read as "the tool returned nothing".
 */
const PAYLOAD_STATES = {
  not_retained: 'Zero Data Retention — nothing was ever persisted',
  not_captured: 'Request Logs are off for this workspace — the workspace owner can enable them',
  missing: 'past the retention window, or not written yet (retry in a moment)',
  unavailable: 'the log store did not answer — retry the read',
};

/**
 * `billed_usd: null` is TWO opposite facts, told apart by `billing`:
 * `unrecorded` — nothing was charged (report $0, do not retry); `pending` —
 * you WILL be charged and the figure lands on the run row later (do not retry,
 * do not report $0). Printing either as a dash would lose the difference.
 */
const costLine = (res) => {
  if (res.billed_usd != null) return usd(res.billed_usd);
  if (res.billing === 'unrecorded') return '$0 (billing unrecorded: not charged, do not retry)';
  if (res.billing === 'pending') {
    return `pending (you WILL be charged; read it later: orca-tools runs get -r ${res.run_id || '<runId>'})`;
  }
  return '—';
};

/**
 * The lines under a refusal, for stderr. Only what the next action depends
 * on: whether a retry is safe, how long to wait, and the approval id a human
 * has to grant before the SAME run is retried.
 */
export const renderErrorDetails = (body, retryAfter) => {
  const out = [];
  if (!body || typeof body !== 'object') return out;
  if (body.outcome) out.push(`outcome     ${body.outcome}`);
  if (body.retry_safe != null) {
    out.push(`retry_safe  ${body.retry_safe ? 'yes — retry once' : 'NO — the action may already have happened; check before retrying'}`);
  }
  const deny = body.deny && typeof body.deny === 'object' ? body.deny : null;
  if (deny?.reason) out.push(`reason      ${deny.reason}`);
  if (deny?.limit != null) out.push(`limit       ${deny.limit}`);
  if (deny?.hint) out.push(`hint        ${deny.hint}`);
  if (deny?.approval_id != null) {
    out.push(`approval    ${deny.approval_id} — once a human approves it, retry the same run with --approval-id ${deny.approval_id}`);
  }
  if (body.firewall_approval_id) {
    out.push(`firewall    ${body.firewall_approval_id} — once a human approves it, retry the same run with --firewall-approval ${body.firewall_approval_id}`);
  }
  const wait = retryAfter || body.retry_after;
  if (wait) out.push(`retry_after ${wait}s`);
  return out;
};

export const renderRuns = (data) => {
  const items = data?.items || [];
  if (!items.length) return 'No runs yet.';
  return (
    table(
      ['RUN ID', 'TOOL', 'STATUS', 'COST', 'WHEN'],
      items.map((r) => [
        r.run_id,
        r.connector_id || '',
        r.status,
        usd(r.billed_usd ?? r.quoted_usd),
        r.created_at ? new Date(Number(r.created_at) * 1000).toISOString() : '',
      ]),
    ) + `\n\n${items.length} of ${data.total ?? items.length}`
  );
};

/**
 * The balance. TWO figures, and the difference matters: `wallet_usd` is the
 * workspace's money; `spendable_usd` is what a run may actually take right
 * now — the wallet plus any credit line, capped by this key's own quota and
 * by a member budget, so it can be far lower than the wallet (or higher, on a
 * workspace billed on credit). Size a batch from spendable; report the wallet
 * to a human. A key-quota limit is not fixed by a top-up.
 */
export const renderBalance = (b) => {
  const out = [`wallet    ${usd(b.wallet_usd)}`];
  if (b.spendable_usd != null) out.push(`spendable ${usd(b.spendable_usd)} (what a run may take now)`);
  if (b.agent_month_left_usd != null) {
    out.push(`budget    ${usd(b.agent_month_left_usd)} left this period`);
  }
  if (b.run_left_usd != null) out.push(`run ref   ${usd(b.run_left_usd)} left in this run budget`);
  return out.join('\n');
};
