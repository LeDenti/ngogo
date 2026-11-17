// The Jira-backed store behind the encirclement index.
//
// A person can have thousands of open requests, so the index is never built by reading them all.
// The store answers a few narrow questions instead, each one a single cheap Jira search:
// "show me a request from a source I have not seen yet", "how many", "which is due first".
//
// Transport-agnostic: the caller supplies `post(path, body)` resolving to {ok, status, json()}.
// In the screens it is the Forge bridge with the viewer's own Jira session, so a viewer
// is never shown a request they are not allowed to browse.

const SEARCH = '/rest/api/3/search/jql';
const COUNT = '/rest/api/3/search/approximate-count';
const BASE_FIELDS = ['assignee', 'reporter', 'duedate', 'project', 'created'];

function person(u) {
  if (!u) return null;
  return { id: u.accountId, name: u.displayName, type: u.accountType, active: u.active !== false };
}

/** Jira issue -> the plain shape used by src/ngogo/encirclement.js. */
export function normalize(i) {
  const f = i.fields;
  return {
    key: i.key,
    project: f.project?.key ?? null,
    assignee: person(f.assignee),
    reporter: person(f.reporter),
    due: f.duedate ?? null,
    created: f.created ?? null,
    comments: (f.comment?.comments ?? []).map((c) => ({ author: person(c.author), created: c.created })),
  };
}

/** JQL string literal. */
export const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const list = (ids) => ids.map(q).join(', ');

export const openOn = (personId) => `assignee = ${q(personId)} AND statusCategory != Done`;

/** JQL for "requests from this source". A queue is every request in a project raised by an app or by nobody. */
export function fromSource(sel) {
  if (sel.kind === 'person') return `reporter = ${q(sel.id)}`;
  const apps = sel.appIds.length ? `reporter in (${list(sel.appIds)}) OR ` : '';
  return `project = ${q(sel.project)} AND (${apps}reporter is EMPTY)`;
}

/** JQL for "requests from none of the sources already seen". */
export function notFromSeen(seen) {
  const parts = [];
  // `not in` alone would silently drop requests that have no reporter.
  if (seen.reporterIds.length) parts.push(`(reporter not in (${list(seen.reporterIds)}) OR reporter is EMPTY)`);
  for (const queue of seen.queues) parts.push(`NOT (${fromSource({ kind: 'queue', ...queue })})`);
  return parts;
}

export function createJiraStore(post) {
  async function page(jql, fields, maxResults = 100) {
    const res = await post(SEARCH, { jql, fields, maxResults });
    if (!res.ok) throw new Error(`Jira search failed with status ${res.status}`);
    const body = await res.json();
    return { issues: (body.issues ?? []).filter((i) => i.fields).map(normalize), more: Boolean(body.nextPageToken) };
  }

  return {
    /** One request by key, or null. */
    async getIssue(key) {
      return (await page(`key = ${q(key)}`, BASE_FIELDS, 1)).issues[0] ?? null;
    },

    /** Up to 100 open requests on a person that come from none of the sources already seen. */
    async pageOpen(personId, seen) {
      return (await page([openOn(personId), ...notFromSeen(seen)].join(' AND '), BASE_FIELDS)).issues;
    },

    /** How many open requests a person has, in all or from one source. Null if Jira will not say. */
    async countOpen(personId, sel = null) {
      const jql = sel ? `${openOn(personId)} AND ${fromSource(sel)}` : openOn(personId);
      const res = await post(COUNT, { jql });
      if (!res.ok) return null;
      const body = await res.json();
      return Number.isInteger(body.count) ? body.count : null;
    },

    /** The earliest due date among a source's open requests on a person, or null. */
    async earliestDue(personId, sel) {
      const jql = `${openOn(personId)} AND ${fromSource(sel)} AND duedate is not EMPTY ORDER BY duedate ASC`;
      return (await page(jql, ['duedate'], 1)).issues[0]?.due ?? null;
    },

    /** Whether a source has at least one open request with no due date on a person. */
    async hasUndated(personId, sel) {
      const jql = `${openOn(personId)} AND ${fromSource(sel)} AND duedate is EMPTY`;
      return (await page(jql, ['duedate'], 1)).issues.length > 0;
    },

    /** A person's open requests touched in the last `days` days, with their comments: where help can show. */
    async recentOpen(personId, days) {
      const jql = `${openOn(personId)} AND updated >= -${Number(days)}d ORDER BY updated DESC`;
      const r = await page(jql, [...BASE_FIELDS, 'comment']);
      return { issues: r.issues, truncated: r.more };
    },

    /** Up to 100 open, assigned requests of a project whose assignee has not been seen yet. */
    async pageAssignees(projectKey, seenIds) {
      const not = seenIds.length ? ` AND assignee not in (${list(seenIds)})` : '';
      const jql = `project = ${q(projectKey)} AND statusCategory != Done AND assignee is not EMPTY${not}`;
      return (await page(jql, ['assignee', 'project'])).issues;
    },
  };
}
