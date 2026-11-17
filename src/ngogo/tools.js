// What Ngogo can tell an agent. Each tool is a plain async function over a store and notes
// (see store-jira.js, notes-jira.js), so the same code answers Rovo, an outside MCP client, and the tests.
// Answers are small JSON objects with a one-sentence `summary`: easy for a model to quote, hard to distort.
import { DEFAULT_PARAMS, formatRatio } from './encirclement.js';
import { issueEncirclement, projectOrganism } from './views.js';
import { incubationLines, releasedRecord, releaseComment } from './membrane.js';
import { InvoicePool } from '../engine/invoices.js';
import { WHY } from './pool.js';

const PROJECT_KEY = /^[A-Z][A-Z0-9_]{1,30}$/;
const ISSUE_KEY = /^[A-Z][A-Z0-9_]{0,30}-[0-9]{1,12}$/;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const refuse = (error) => ({ ok: false, error });

function personBrief(p) {
  return {
    name: p.name,
    state: p.state,
    ratio: `${formatRatio(p.ratio_centi)} : 1`,
    independent_sources: p.source_count,
    allies: p.allies.map((a) => a.name),
    open_requests: p.open_requests,
    main_sources: p.sources.slice(0, 5).map((s) => ({ source: s.label, open_requests: s.requests })),
    ratio_with_one_more_ally: `${formatRatio(p.ratio_with_one_more_ally_centi)} : 1`,
    state_with_one_more_ally: p.state_with_one_more_ally,
  };
}

const RULE =
  'ratio = urgency-weighted independent sources / (1 + allies); an ally is someone other than the requester ' +
  `who acted on the person's open requests in the last ${DEFAULT_PARAMS.window_days} days; ` +
  `wary from ${formatRatio(DEFAULT_PARAMS.wary_centi)}, cornered from ${formatRatio(DEFAULT_PARAMS.cornered_centi)}. ` +
  'The index exists to protect people, never to rank them.';

/** Who is cornered in a project. */
export async function whoIsCornered(store, { projectKey }, nowMs = Date.now()) {
  if (!PROJECT_KEY.test(String(projectKey ?? ''))) return refuse('Give a Jira project key, for example OPS.');
  const r = await projectOrganism(store, projectKey, nowMs);
  const cornered = r.people.filter((p) => p.state === 'cornered');
  const wary = r.people.filter((p) => p.state === 'wary');
  return {
    ok: true,
    project: projectKey,
    summary:
      r.people.length === 0
        ? `Nobody has an open request assigned in ${projectKey}.`
        : `In ${projectKey}, ${plural(cornered.length, 'person is', 'people are')} cornered` +
          `${cornered.length ? ` (${cornered.map((p) => p.name).join(', ')})` : ''} and ` +
          `${plural(wary.length, 'person is', 'people are')} wary, out of ${r.people.length} with open work.`,
    people: r.people.slice(0, 25).map(personBrief),
    rule: RULE,
    incomplete: r.truncated || r.people.length > 25,
  };
}

/** The balance of power around the assignee of one request, and whether Ngogo holds it. */
export async function requestEncirclement(store, notes, { issueKey }, nowMs = Date.now()) {
  if (!ISSUE_KEY.test(String(issueKey ?? ''))) return refuse('Give a Jira issue key, for example OPS-12.');
  const r = await issueEncirclement(store, issueKey, nowMs);
  if (r.status === 'not_found') return refuse(`${issueKey} does not exist or you cannot see it.`);
  if (r.status === 'unassigned') return { ok: true, request: issueKey, summary: `${issueKey} is assigned to nobody, so it corners nobody yet.`, assignee: null, held: null };
  const record = await notes.read(issueKey).catch(() => null);
  const p = r.person;
  const src = r.thisRequest.source;
  return {
    ok: true,
    request: issueKey,
    summary:
      `${p.name} is ${p.state} at ${formatRatio(p.ratio_centi)} to 1: ${plural(p.source_count, 'independent source', 'independent sources')}, ` +
      `${plural(p.ally_count, 'ally', 'allies')}, ${plural(p.open_requests, 'open request', 'open requests')}.` +
      (record?.state === 'incubating' ? ` Ngogo holds ${issueKey} in incubation until ${record.until}.` : ''),
    assignee: personBrief(p),
    this_request_comes_from: r.thisRequest.selfRaised ? 'the assignee themself (no outside pressure)' : src ? src.label : null,
    held: record
      ? { state: record.state, since: record.since, until: record.until, release_reason: record.release_reason ?? null, notice: record.state === 'incubating' ? incubationLines(record) : null }
      : null,
    rule: RULE,
    incomplete: r.truncated,
  };
}

/** The requests Ngogo currently holds in incubation, optionally for one project. */
export async function heldRequests(notes, { projectKey } = {}) {
  if (projectKey !== undefined && projectKey !== null && projectKey !== '' && !PROJECT_KEY.test(String(projectKey))) {
    return refuse('Give a Jira project key, for example OPS, or none for every project.');
  }
  const keys = (await notes.listIncubating(50)).filter((k) => !projectKey || k.startsWith(`${projectKey}-`));
  const held = [];
  for (const key of keys.slice(0, 25)) {
    const r = await notes.read(key).catch(() => null);
    if (!r || r.state !== 'incubating') continue;
    held.push({
      request: key, assignee: r.person.name, held_since: r.since, held_until: r.until,
      ratio_when_held: `${formatRatio(r.ratio_centi)} : 1`, suggested_ally: r.suggested_ally?.name ?? null,
    });
  }
  return {
    ok: true,
    summary: held.length ? `Ngogo holds ${plural(held.length, 'request', 'requests')} in incubation${projectKey ? ` in ${projectKey}` : ''}.` : `Ngogo holds nothing in incubation${projectKey ? ` in ${projectKey}` : ''}.`,
    held,
    incomplete: keys.length > 25,
  };
}

/** Releases one held request, with the rights of the person asking. */
export async function releaseRequest(notes, { issueKey }, accountId, nowMs = Date.now()) {
  if (!ISSUE_KEY.test(String(issueKey ?? ''))) return refuse('Give a Jira issue key, for example OPS-12.');
  const record = await notes.read(issueKey);
  if (!record) return { ok: true, released: false, summary: `Ngogo never held ${issueKey}.` };
  if (record.state !== 'incubating') return { ok: true, released: false, summary: `${issueKey} is not held any more (${record.release_reason ?? 'released'}).` };
  const released = releasedRecord(record, 'released_by_hand', nowMs, accountId ?? null);
  await notes.write(issueKey, released);
  await notes.comment(issueKey, releaseComment(released));
  return { ok: true, released: true, summary: `${issueKey} is released from incubation. ${record.person.name} was at ${formatRatio(record.ratio_centi)} to 1 when it was held.` };
}

const whole = (v) => Number.isInteger(v) && v >= 0 && v <= 1_000_000_000;

/**
 * A what-if on the Ferret decision engine: would a pool of this size advance on this invoice?
 * Stateless: the pool is described in the question, nothing is stored, no money exists.
 */
export function advanceWhatIf({ poolCapital, debtorAlreadyOwes = 0, face, advance, fee = 0, daysUntilDue, afterADefault = false }) {
  const given = { poolCapital, debtorAlreadyOwes, face, advance, fee, daysUntilDue };
  for (const [name, v] of Object.entries(given)) if (!whole(v)) return refuse(`${name} must be a whole number between 0 and 1,000,000,000.`);

  const pool = new InvoicePool();
  const step = (t, op, args) => pool.apply(op, t, args);
  let t = 0;
  if (step(t, 'deposit', { lender: 'pool', amount: poolCapital }).decision !== 'ok') return refuse('The pool needs a positive capital.');
  if (debtorAlreadyOwes > 0) {
    const d = step(t, 'advance', { invoice: 'EARLIER', supplier: 'earlier', debtor: 'debtor', face: debtorAlreadyOwes * 2, advance: debtorAlreadyOwes, fee: 0, due: t + 60, analysis: true });
    if (d.decision !== 'ok') return refuse(`The pool described is already past its own ceilings on this debtor (${d.family}).`);
  }
  if (afterADefault) {
    // Another debtor took a small advance and never paid: the pool has just written it off.
    const small = Math.max(1, Math.floor(poolCapital / 20));
    step(t, 'advance', { invoice: 'LOST', supplier: 'other', debtor: 'other debtor', face: small * 2, advance: small, fee: 0, due: t + 1, analysis: true });
    t += 1 + pool.policy.grace + 1;
    step(t, 'default', { invoice: 'LOST' });
  }
  const before = pool.snapshot();
  const d = step(t, 'advance', { invoice: 'ASKED', supplier: 'supplier', debtor: 'debtor', face, advance, fee, due: t + daysUntilDue, analysis: true });
  const ok = d.decision === 'ok';
  const mood = `${before.mood} (stress ${formatRatio(before.stress_bps)} %)`;
  return {
    ok: true,
    decision: ok ? 'advance' : 'refuse',
    reason: ok ? null : d.family,
    summary: ok
      ? `Yes: a pool of ${poolCapital} in a ${before.mood} mood advances ${advance} on this invoice of ${face}.`
      : `No: ${WHY[d.family] ?? d.family}. The pool is ${before.mood}.`,
    mood,
    ceilings_now: { debtor_share_of_pool: `${formatRatio(before.effective.share_bps)} %`, longest_term_days: before.effective.max_term },
    note: 'A what-if on a pool described in the question. Play numbers: no pool is stored and no money moves.',
  };
}
