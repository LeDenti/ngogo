// Ngogo: the membrane.
//
// When a request lands on someone who is already cornered, the membrane does not refuse it
// and does not remove it. It holds it in incubation for a while, says why in plain words on the
// request itself, and proposes an ally. Nothing is eliminated; the predator queue becomes a turn.
//
// This file is pure: decisions and texts only, no I/O. See membrane-run.js for the orchestration.
import { formatRatio } from './encirclement.js';

export const PROPERTY_KEY = 'ngogo-incubation';
export const MEMBRANE_PARAMS = {
  hold_hours: 48,       // how long a request is held if nothing changes
  ally_candidates: 5,   // how many colleagues of the same project are considered as allies
};

const HOUR_MS = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();

/** Should this request be held? `index` is the encirclement of its assignee, this request included. */
export function membraneDecision(issue, index, existing) {
  if (!issue.assignee) return { action: 'pass', reason: 'unassigned' };
  if (issue.reporter && issue.reporter.id === issue.assignee.id) return { action: 'pass', reason: 'self_raised' };
  // One decision per request and per person: never hold twice, never argue with a human release.
  if (existing && existing.person && existing.person.id === issue.assignee.id) return { action: 'pass', reason: 'already_decided' };
  if (!index || index.state !== 'cornered') return { action: 'pass', reason: 'not_cornered' };
  return { action: 'incubate', reason: 'cornered' };
}

/**
 * The best ally among colleagues: someone calm, with the lowest ratio, then the fewest open requests.
 * Returns null when nobody is calm: then it is a staffing problem, not a routing one, and we say so.
 */
export function pickAlly(person, candidates) {
  const calm = candidates.filter((c) => c.id !== person.id && c.state === 'calm');
  calm.sort((a, b) => a.ratio_centi - b.ratio_centi || (a.open_requests ?? 0) - (b.open_requests ?? 0) || (a.id < b.id ? -1 : 1));
  const best = calm[0];
  return best ? { id: best.id, name: best.name, ratio_centi: best.ratio_centi } : null;
}

/** What is written on the request (an issue property) when it is held. */
export function incubationRecord(issue, index, ally, nowMs, params = MEMBRANE_PARAMS, thresholds) {
  return {
    v: 1,
    state: 'incubating',
    person: { id: issue.assignee.id, name: issue.assignee.name },
    since: iso(nowMs),
    until: iso(nowMs + params.hold_hours * HOUR_MS),
    ratio_centi: index.ratio_centi,
    source_count: index.source_count,
    ally_count: index.ally_count,
    cornered_centi: thresholds.cornered_centi,
    suggested_ally: ally,
  };
}

/** The same record, released. reason: 'expired' | 'relieved' | 'reassigned' | 'released_by_hand'. */
export function releasedRecord(record, reason, nowMs, by = null) {
  return { ...record, state: 'released', released_at: iso(nowMs), release_reason: reason, ...(by ? { released_by: by } : {}) };
}

/** What the hourly sweep does with a held request. `index` may be null when it was not needed. */
export function sweepDecision(record, issue, index, nowMs) {
  if (!record || record.state !== 'incubating') return { action: 'keep' };
  if (!issue.assignee || issue.assignee.id !== record.person.id) return { action: 'release', reason: 'reassigned' };
  if (nowMs >= Date.parse(record.until)) return { action: 'release', reason: 'expired' };
  if (index && index.state !== 'cornered') return { action: 'release', reason: 'relieved' };
  return { action: 'keep' };
}

const when = (isoString) => `${isoString.slice(0, 10)} ${isoString.slice(11, 16)} UTC`;
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The plain sentences of the hold notice. No requester is named: counts only. */
export function incubationLines(r) {
  const lines = [
    `Ngogo is holding this request in incubation until ${when(r.until)}.`,
    `${r.person.name} is already pressed by ${plural(r.source_count, 'independent source', 'independent sources')} ` +
      `with ${plural(r.ally_count, 'person', 'people')} acting alongside: ${formatRatio(r.ratio_centi)} to 1, ` +
      `where Ngogo flags ${formatRatio(r.cornered_centi)} to 1. Nothing is refused: the request stays assigned and visible.`,
  ];
  lines.push(
    r.suggested_ally
      ? `What would help: ${r.suggested_ally.name} has the lightest load among colleagues in this project ` +
        `(${formatRatio(r.suggested_ally.ratio_centi)} to 1) and could take this request or act on it alongside ${r.person.name}. ` +
        `Moving the due date helps too.`
      : `Nobody among the colleagues Ngogo looked at in this project is calm: this is a staffing question, not a routing one. ` +
        `Moving the due date is what would help.`
  );
  lines.push('Anyone who can edit this request can release it from the Ngogo panel.');
  return lines;
}

/** The hold notice as a Jira comment body (Atlassian Document Format). */
export function incubationComment(record) {
  return { type: 'doc', version: 1, content: incubationLines(record).map(p) };
}

const RELEASE_TEXT = {
  expired: 'the holding time is over',
  relieved: 'the person is no longer cornered',
  reassigned: 'the request was assigned to someone else',
  released_by_hand: 'someone released it from the panel',
};

export function releaseComment(record) {
  return { type: 'doc', version: 1, content: [p(`Ngogo released this request from incubation: ${RELEASE_TEXT[record.release_reason] ?? record.release_reason}.`)] };
}
