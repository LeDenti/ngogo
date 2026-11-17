// Ngogo: the encirclement index.
//
// In Ngogo, chimpanzees attack when they heavily outnumber a victim. Teams do the same thing politely,
// with due dates: many independent requesters converge on one person who has few people helping.
// This module counts that balance of power for each person, from plain issue data.
//
//   pressure = sum, over the distinct SOURCES with an open request on the person,
//              of the urgency weight of that source's most urgent request
//   allies   = distinct people who acted alongside the person on those requests, recently
//   ratio    = pressure / (1 + allies)        (the 1 is the person themself)
//
// Pure function, no I/O, integer arithmetic only (weights in basis points, ratio in hundredths),
// so the same input always gives the same answer on every runtime. Same discipline as the Ferret engine.

const BPS = 10_000;
const DAY_MS = 86_400_000;

export const DEFAULT_PARAMS = {
  // Only actions this recent count as help. Old comments do not make an ally.
  window_days: 14,
  // Ratio thresholds, in hundredths: 300 = 3.00 sources per defender.
  wary_centi: 300,
  // 8 to 1 is a prudential default, not a published measurement. It is a setting.
  cornered_centi: 800,
  // Urgency of a request by days left before its due date, in basis points.
  weight_bps: { due_3: 10_000, due_7: 8_000, due_14: 6_000, due_30: 4_000, later: 2_000, none: 5_000 },
};

/** Whole days since 1970-01-01 (UTC) for a 'YYYY-MM-DD' date. */
export function dayOfDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Whole days since 1970-01-01 (UTC) for an epoch in milliseconds or an ISO timestamp. */
export function dayOfInstant(t) {
  const ms = typeof t === 'number' ? t : Date.parse(t);
  return Math.floor(ms / DAY_MS);
}

/** Urgency weight of one request. Overdue counts as most urgent. */
export function urgencyBps(dueDay, today, w) {
  if (dueDay === null) return w.none;
  const left = dueDay - today;
  if (left <= 3) return w.due_3;
  if (left <= 7) return w.due_7;
  if (left <= 14) return w.due_14;
  if (left <= 30) return w.due_30;
  return w.later;
}

/**
 * Who is behind a request. A human requester (teammate or customer) is a source by themself.
 * A request raised by an app or with no reporter is attributed to the project it lives in:
 * the queue is the source.
 */
export function sourceOf(issue) {
  const r = issue.reporter;
  if (r && r.type !== 'app') return { key: `user:${r.id}`, kind: 'person', label: r.name };
  return { key: `project:${issue.project}`, kind: 'queue', label: `${issue.project} queue` };
}

function stateOf(ratio_centi, p) {
  if (ratio_centi >= p.cornered_centi) return 'cornered';
  if (ratio_centi >= p.wary_centi) return 'wary';
  return 'calm';
}

/**
 * People who helped: someone other than the person and other than the requester
 * who acted on one of the person's open requests within the window. Apps do not count.
 */
export function alliesOf(person, issues, today, params = DEFAULT_PARAMS) {
  const allies = new Map();
  const since = today - params.window_days;
  for (const issue of issues) {
    for (const c of issue.comments ?? []) {
      const a = c.author;
      if (!a || a.type === 'app' || a.id === person.id) continue;
      if (issue.reporter && a.id === issue.reporter.id) continue;
      const day = dayOfInstant(c.created);
      if (day < since || day > today) continue;
      const ally = allies.get(a.id) ?? { id: a.id, name: a.name, actions: 0 };
      ally.actions += 1;
      allies.set(a.id, ally);
    }
  }
  return [...allies.values()];
}

/**
 * Weight of a source from what is known about its requests: the urgency of its earliest due date,
 * and at least the "no due date" weight if any of its requests has none.
 * Equal to the maximum urgency over the source's requests, without having to read them all.
 */
export function weightOfSource(earliestDue, hasUndated, today, w) {
  let weight = 0;
  if (earliestDue) weight = urgencyBps(dayOfDate(earliestDue), today, w);
  if (hasUndated && w.none > weight) weight = w.none;
  return weight;
}

/**
 * Final step: from the sources and the allies of a person to the ratio and the state.
 * @param sources [{key, kind, label, requests, weight_bps, nearest_due_days, issues?}]
 * @param allies  [{id, name, actions}]
 */
export function summarize(person, sources, allies, open_requests, params = DEFAULT_PARAMS) {
  const sourceList = [...sources].sort(
    (a, b) => b.weight_bps - a.weight_bps || b.requests - a.requests || (a.key < b.key ? -1 : 1)
  );
  const allyList = [...allies].sort((a, b) => b.actions - a.actions || (a.id < b.id ? -1 : 1));

  let pressure_bps = 0;
  for (const s of sourceList) pressure_bps += s.weight_bps;
  const defenders = 1 + allyList.length;
  const ratio_centi = Math.floor((pressure_bps * 100) / (BPS * defenders));
  const ratio_with_one_more_ally_centi = Math.floor((pressure_bps * 100) / (BPS * (defenders + 1)));

  return {
    id: person.id,
    name: person.name,
    open_requests,
    sources: sourceList,
    source_count: sourceList.length,
    pressure_bps,
    allies: allyList,
    ally_count: allyList.length,
    ratio_centi,
    state: stateOf(ratio_centi, params),
    ratio_with_one_more_ally_centi,
    state_with_one_more_ally: stateOf(ratio_with_one_more_ally_centi, params),
  };
}

/**
 * The index for one person, from the full list of their open requests.
 * @param person  {id, name}
 * @param issues  open issues assigned to that person:
 *                {key, project, reporter:{id,name,type}|null, due:'YYYY-MM-DD'|null,
 *                 comments:[{author:{id,name,type}, created: ISO string | epoch ms}]}
 * @param today   whole days since epoch (see dayOfInstant)
 */
export function encirclementOf(person, issues, today, params = DEFAULT_PARAMS) {
  const sources = new Map();
  for (const issue of issues) {
    // A request the person raised for themself is not a source.
    if (issue.reporter && issue.reporter.id === person.id) continue;
    const src = sourceOf(issue);
    const dueDay = issue.due ? dayOfDate(issue.due) : null;
    const weight = urgencyBps(dueDay, today, params.weight_bps);
    const s = sources.get(src.key) ?? { ...src, requests: 0, weight_bps: 0, nearest_due_days: null, issues: [] };
    s.requests += 1;
    s.issues.push(issue.key);
    if (weight > s.weight_bps) s.weight_bps = weight;
    if (dueDay !== null) {
      const left = dueDay - today;
      if (s.nearest_due_days === null || left < s.nearest_due_days) s.nearest_due_days = left;
    }
    sources.set(src.key, s);
  }
  return summarize(person, [...sources.values()], alliesOf(person, issues, today, params), issues.length, params);
}

/** The index for everyone who has an open request assigned, most cornered first. */
export function encirclementOfAll(issues, today, params = DEFAULT_PARAMS) {
  const byPerson = new Map();
  for (const issue of issues) {
    if (!issue.assignee) continue;
    const e = byPerson.get(issue.assignee.id) ?? { person: issue.assignee, issues: [] };
    e.issues.push(issue);
    byPerson.set(issue.assignee.id, e);
  }
  return [...byPerson.values()]
    .map((e) => encirclementOf(e.person, e.issues, today, params))
    .sort((a, b) => b.ratio_centi - a.ratio_centi || b.pressure_bps - a.pressure_bps || (a.id < b.id ? -1 : 1));
}

/** "7.33" for 733. Display only. */
export function formatRatio(centi) {
  return `${Math.floor(centi / 100)}.${String(centi % 100).padStart(2, '0')}`;
}
