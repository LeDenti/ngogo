// The two questions Ngogo answers, as plain async functions over a store (see store-jira.js).
//   issueEncirclement : the balance of power around the assignee of one request
//   projectOrganism   : the same index for everyone who has open work in one project
import { DEFAULT_PARAMS, dayOfInstant, dayOfDate, alliesOf, weightOfSource, summarize, sourceOf } from './encirclement.js';

const MAX_ROUNDS = 40;      // discovery rounds per person: each round finds at least one new source
const MAX_PEOPLE = 60;      // people shown on a project page
const PARALLEL_PEOPLE = 4;  // people indexed at the same time

/**
 * Finds every source with an open request on a person without reading every request:
 * ask for requests from sources not seen yet, note the new sources, ask again, until none is left.
 */
async function discoverSources(store, person) {
  const reporterIds = [person.id]; // requests the person raised for themself are not pressure
  const queues = new Map();        // project -> Set of app account ids seen raising requests there
  const sources = new Map();
  let complete = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const seen = { reporterIds, queues: [...queues].map(([project, apps]) => ({ project, appIds: [...apps] })) };
    const issues = await store.pageOpen(person.id, seen);
    if (issues.length === 0) { complete = true; break; }
    let progress = false;
    for (const issue of issues) {
      const src = sourceOf(issue);
      if (src.kind === 'person') {
        if (!reporterIds.includes(issue.reporter.id)) { reporterIds.push(issue.reporter.id); progress = true; }
        if (!sources.has(src.key)) sources.set(src.key, { ...src, sel: { kind: 'person', id: issue.reporter.id } });
      } else {
        if (!queues.has(issue.project)) { queues.set(issue.project, new Set()); progress = true; }
        const apps = queues.get(issue.project);
        if (issue.reporter && !apps.has(issue.reporter.id)) { apps.add(issue.reporter.id); progress = true; }
        if (!sources.has(src.key)) sources.set(src.key, { ...src, project: issue.project });
      }
    }
    if (!progress) break; // defensive: never loop on an answer that teaches nothing
  }
  for (const s of sources.values()) {
    if (s.kind === 'queue') s.sel = { kind: 'queue', project: s.project, appIds: [...queues.get(s.project)] };
  }
  return { sources: [...sources.values()], complete };
}

/** The index for one person, whatever the number of their open requests. */
export async function personIndex(store, person, today, params = DEFAULT_PARAMS) {
  const [{ sources, complete }, open_requests, recent] = await Promise.all([
    discoverSources(store, person),
    store.countOpen(person.id),
    store.recentOpen(person.id, params.window_days),
  ]);

  const measured = await Promise.all(sources.map(async (s) => {
    const [requests, earliest, undated] = await Promise.all([
      store.countOpen(person.id, s.sel),
      store.earliestDue(person.id, s.sel),
      store.hasUndated(person.id, s.sel),
    ]);
    return {
      key: s.key, kind: s.kind, label: s.label,
      requests: requests ?? 1,
      weight_bps: weightOfSource(earliest, undated, today, params.weight_bps),
      nearest_due_days: earliest ? dayOfDate(earliest) - today : null,
    };
  }));

  const result = summarize(person, measured, alliesOf(person, recent.issues, today, params), open_requests, params);
  return { ...result, truncated: !complete || recent.truncated };
}

export async function issueEncirclement(store, issueKey, nowMs = Date.now(), params = DEFAULT_PARAMS) {
  const today = dayOfInstant(nowMs);
  const issue = await store.getIssue(issueKey);
  if (!issue) return { status: 'not_found', issueKey };
  if (!issue.assignee) return { status: 'unassigned', issueKey };

  const person = await personIndex(store, issue.assignee, today, params);
  const selfRaised = Boolean(issue.reporter && issue.reporter.id === issue.assignee.id);
  const src = selfRaised ? null : sourceOf(issue);
  const mine = src ? person.sources.find((s) => s.key === src.key) : null;
  return {
    status: 'ok',
    issueKey,
    params,
    truncated: person.truncated,
    person,
    thisRequest: { selfRaised, source: mine ? { label: mine.label, kind: mine.kind, requests: mine.requests } : null },
  };
}

export async function projectOrganism(store, projectKey, nowMs = Date.now(), params = DEFAULT_PARAMS) {
  const today = dayOfInstant(nowMs);

  // Who has open work in this project? Same discovery by exclusion, on assignees.
  const people = new Map();
  let truncated = false;
  for (let round = 0; round < MAX_ROUNDS && people.size < MAX_PEOPLE; round++) {
    const issues = await store.pageAssignees(projectKey, [...people.keys()]);
    if (issues.length === 0) break;
    const before = people.size;
    for (const i of issues) people.set(i.assignee.id, i.assignee);
    if (people.size === before) break;
    if (round === MAX_ROUNDS - 1 || people.size >= MAX_PEOPLE) truncated = true;
  }
  const active = [...people.values()].filter((p) => p.active).slice(0, MAX_PEOPLE);

  // Index them a few at a time: pressure is counted in every project the viewer can see.
  const results = [];
  for (let i = 0; i < active.length; i += PARALLEL_PEOPLE) {
    results.push(...(await Promise.all(active.slice(i, i + PARALLEL_PEOPLE).map((p) => personIndex(store, p, today, params)))));
  }
  results.sort((a, b) => b.ratio_centi - a.ratio_centi || b.pressure_bps - a.pressure_bps || (a.id < b.id ? -1 : 1));
  return { status: 'ok', projectKey, params, truncated: truncated || results.some((r) => r.truncated), people: results };
}
