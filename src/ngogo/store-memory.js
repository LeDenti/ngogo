// An in-memory store with the same interface as store-jira.js.
// Used by the tests and by the demo organisation: the index and the membrane run on it unchanged.
// `issues` are in the plain shape (see normalize): {key, project, assignee, reporter, due, comments, done?, updatedDay?}.

const matches = (issue, sel) =>
  sel.kind === 'person'
    ? Boolean(issue.reporter && issue.reporter.id === sel.id)
    : issue.project === sel.project && (!issue.reporter || sel.appIds.includes(issue.reporter.id));

export function createMemoryStore(issues, { pageSize = 100, today = 0 } = {}) {
  const calls = { pageOpen: 0, pageAssignees: 0 };
  const openOn = (id) => issues.filter((i) => !i.done && i.assignee && i.assignee.id === id);
  return {
    calls,
    async getIssue(key) { return issues.find((i) => i.key === key) ?? null; },
    async pageOpen(personId, seen) {
      calls.pageOpen++;
      return openOn(personId)
        .filter((i) => !(i.reporter && seen.reporterIds.includes(i.reporter.id)))
        .filter((i) => !seen.queues.some((queue) => matches(i, { kind: 'queue', ...queue })))
        .slice(0, pageSize);
    },
    async countOpen(personId, sel = null) { return openOn(personId).filter((i) => !sel || matches(i, sel)).length; },
    async earliestDue(personId, sel) {
      const dues = openOn(personId).filter((i) => matches(i, sel) && i.due).map((i) => i.due).sort();
      return dues[0] ?? null;
    },
    async hasUndated(personId, sel) { return openOn(personId).some((i) => matches(i, sel) && !i.due); },
    async recentOpen(personId, days) {
      const hit = openOn(personId).filter((i) => (i.updatedDay ?? today) >= today - days);
      return { issues: hit.slice(0, pageSize), truncated: hit.length > pageSize };
    },
    async pageAssignees(projectKey, seenIds) {
      calls.pageAssignees++;
      return issues.filter((i) => !i.done && i.project === projectKey && i.assignee && !seenIds.includes(i.assignee.id)).slice(0, pageSize);
    },
  };
}

/** In-memory notes with the same interface as notes-jira.js. */
export function createMemoryNotes(records = new Map(), comments = []) {
  return {
    records, comments,
    async read(key) { return records.get(key) ?? null; },
    async write(key, r) { records.set(key, r); },
    async comment(key, body) { comments.push([key, body]); },
    async listIncubating() { return [...records].filter(([, r]) => r.state === 'incubating').map(([k]) => k); },
  };
}
