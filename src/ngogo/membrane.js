// Ngogo: the membrane.
//
// When a request lands on someone who is already cornered, the membrane does not refuse it
// and does not remove it. It holds it in incubation for a while, says why in plain words on the
// request itself, and proposes an ally. Nothing is eliminated; the predator queue becomes a turn.
//
// This file is pure: decisions and texts only, no I/O. See membrane-run.js for the orchestration.
//
// Privacy by construction: what Ngogo stores about a hold (an issue property) is counts and dates only.
// No account id and no name is ever stored. Names appear only in the notice, which is an ordinary Jira comment,
// and on screen, where they are read live from Jira with the viewer's own rights.
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
  // One decision per request: never hold twice, never argue with a human release.
  if (existing) return { action: 'pass', reason: 'already_decided' };
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

/** What is written on the request (an issue property) when it is held. Counts and dates only. */
export function incubationRecord(index, ally, nowMs, params = MEMBRANE_PARAMS, thresholds) {
  return {
    v: 2,
    state: 'incubating',
    since: iso(nowMs),
    until: iso(nowMs + params.hold_hours * HOUR_MS),
    ratio_centi: index.ratio_centi,
    source_count: index.source_count,
    ally_count: index.ally_count,
    cornered_centi: thresholds.cornered_centi,
    ally_proposed: Boolean(ally),
    ally_ratio_centi: ally ? ally.ratio_centi : null,
  };
}

/** Removes anything about a person from a record written by an earlier version. Returns the same object if clean. */
export function withoutPeople(record) {
  if (!record || (!('person' in record) && !('suggested_ally' in record) && !('released_by' in record))) return record;
  const { person, suggested_ally, released_by, ...rest } = record;
  return { ...rest, v: 2, ally_proposed: Boolean(suggested_ally), ally_ratio_centi: suggested_ally?.ratio_centi ?? null };
}

/** The same record, released. reason: 'expired' | 'relieved' | 'reassigned' | 'released_by_hand'. */
export function releasedRecord(record, reason, nowMs) {
  return { ...withoutPeople(record), state: 'released', released_at: iso(nowMs), release_reason: reason };
}

/** What the hourly sweep does with a held request. `index` is the encirclement of its current assignee, or null. */
export function sweepDecision(record, issue, index, nowMs) {
  if (!record || record.state !== 'incubating') return { action: 'keep' };
  if (!issue.assignee) return { action: 'release', reason: 'reassigned' };
  if (nowMs >= Date.parse(record.until)) return { action: 'release', reason: 'expired' };
  // Reassigned to someone calm, or helped: either way nobody cornered holds this request any more.
  if (index && index.state !== 'cornered') return { action: 'release', reason: 'relieved' };
  return { action: 'keep' };
}

const when = (isoString) => `${isoString.slice(0, 10)} ${isoString.slice(11, 16)} UTC`;
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The plain sentences of the hold notice. No requester is named: counts only.
 * `names` = {person, ally}: read live from Jira by the caller, never from the record.
 */
export function incubationLines(r, names = {}) {
  const person = names.person ?? 'The assignee';
  const lines = [
    `Ngogo is holding this request in incubation until ${when(r.until)}.`,
    `${person} is already pressed by ${plural(r.source_count, 'independent source', 'independent sources')} ` +
      `with ${plural(r.ally_count, 'person', 'people')} acting alongside: ${formatRatio(r.ratio_centi)} to 1, ` +
      `where Ngogo flags ${formatRatio(r.cornered_centi)} to 1. Nothing is refused: the request stays assigned and visible.`,
  ];
  if (r.ally_proposed && names.ally) {
    lines.push(
      `What would help: ${names.ally} has the lightest load among colleagues in this project ` +
        `(${formatRatio(r.ally_ratio_centi)} to 1) and could take this request or act on it alongside ${person}. ` +
        `Moving the due date helps too.`
    );
  } else if (r.ally_proposed) {
    lines.push(`What would help: Ngogo proposed an ally in its notice on this request. Moving the due date helps too.`);
  } else {
    lines.push(
      `Nobody among the colleagues Ngogo looked at in this project is calm: this is a staffing question, not a routing one. ` +
        `Moving the due date is what would help.`
    );
  }
  lines.push('Anyone who can edit this request can release it from the Ngogo panel.');
  return lines;
}

/** The hold notice as a Jira comment body (Atlassian Document Format). */
export function incubationComment(record, names) {
  return { type: 'doc', version: 1, content: incubationLines(record, names).map(p) };
}

const RELEASE_TEXT = {
  expired: 'the holding time is over',
  relieved: 'nobody cornered holds it any more',
  reassigned: 'the request is no longer assigned',
  released_by_hand: 'someone released it from the panel',
};

export function releaseComment(record) {
  return { type: 'doc', version: 1, content: [p(`Ngogo released this request from incubation: ${RELEASE_TEXT[record.release_reason] ?? record.release_reason}.`)] };
}
