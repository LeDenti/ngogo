// The membrane at work: reads through a store, decides with the pure functions, writes through `notes`.
//   store : see store-jira.js (getIssue, pageAssignees, and what personIndex needs)
//   notes : { read(key), write(key, record), comment(key, adf), listIncubating(limit) }  (see notes-jira.js)
import { DEFAULT_PARAMS, dayOfInstant } from './encirclement.js';
import { personIndex } from './views.js';
import {
  MEMBRANE_PARAMS, membraneDecision, pickAlly, incubationRecord, incubationComment,
  sweepDecision, releasedRecord, releaseComment,
} from './membrane.js';

const BIRTH_MS = 120_000; // an assignment this soon after creation is part of the creation

const within = (promise, ms, fallback) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);

/** Colleagues with open work in the same project, indexed, to look for an ally. */
async function colleagues(store, issue, today, params, limit) {
  const seen = new Map();
  for (const i of await store.pageAssignees(issue.project, [issue.assignee.id])) {
    if (i.assignee.active && !seen.has(i.assignee.id)) seen.set(i.assignee.id, i.assignee);
    if (seen.size >= limit) break;
  }
  return Promise.all([...seen.values()].map((c) => personIndex(store, c, today, params)));
}

/** Called when a request is created or assigned. Returns what was done, for the logs and the tests. */
export async function onRequest(store, notes, issueKey, nowMs = Date.now(), opts = {}) {
  const params = opts.params ?? DEFAULT_PARAMS;
  const membrane = opts.membrane ?? MEMBRANE_PARAMS;
  const allyBudgetMs = opts.allyBudgetMs ?? 10_000;
  const today = dayOfInstant(nowMs);

  const issue = await store.getIssue(issueKey);
  if (!issue) return { action: 'pass', reason: 'not_found' };
  // Jira sends both "created" and "assigned" when a request is born with an assignee:
  // the creation event is the one that decides, the assignment event that comes with it is ignored.
  if (opts.event === 'assigned' && issue.created && nowMs - Date.parse(issue.created) < BIRTH_MS) {
    return { action: 'pass', reason: 'covered_by_creation' };
  }
  const existing = await notes.read(issueKey);
  // Cheap exits first: the index is only computed when it can change the decision.
  const early = membraneDecision(issue, { state: 'cornered' }, existing);
  if (early.action === 'pass') return early;

  const index = await personIndex(store, issue.assignee, today, params);
  const decision = membraneDecision(issue, index, existing);
  if (decision.action === 'pass') return { ...decision, ratio_centi: index.ratio_centi };

  // Looking for an ally must never delay the hold itself: give it a time budget.
  const others = await within(colleagues(store, issue, today, params, membrane.ally_candidates).catch(() => []), allyBudgetMs, []);
  const ally = pickAlly(issue.assignee, others);
  // Deciding took a few seconds: look again before writing, so two events can never both speak.
  const now = await notes.read(issueKey);
  if (now && now.person && now.person.id === issue.assignee.id) return { action: 'pass', reason: 'already_decided' };
  const record = incubationRecord(issue, index, ally, nowMs, membrane, params);
  await notes.write(issueKey, record);
  await notes.comment(issueKey, incubationComment(record));
  return { action: 'incubate', record };
}

/** Called every hour: releases what should no longer be held. */
export async function sweep(store, notes, nowMs = Date.now(), opts = {}) {
  const params = opts.params ?? DEFAULT_PARAMS;
  const today = dayOfInstant(nowMs);
  const done = [];
  const cache = new Map(); // one index per person per sweep
  for (const key of await notes.listIncubating(opts.limit ?? 25)) {
    const [issue, record] = await Promise.all([store.getIssue(key), notes.read(key)]);
    if (!issue || !record) continue;
    let d = sweepDecision(record, issue, null, nowMs);
    if (d.action === 'keep' && record.state === 'incubating') {
      if (!cache.has(issue.assignee.id)) cache.set(issue.assignee.id, await personIndex(store, issue.assignee, today, params));
      d = sweepDecision(record, issue, cache.get(issue.assignee.id), nowMs);
    }
    if (d.action === 'release') {
      const released = releasedRecord(record, d.reason, nowMs);
      await notes.write(key, released);
      await notes.comment(key, releaseComment(released));
      done.push({ key, reason: d.reason });
    }
  }
  return done;
}
