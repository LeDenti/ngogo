import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueEncirclement, projectOrganism, personIndex } from '../src/ngogo/views.js';
import { encirclementOf, dayOfInstant } from '../src/ngogo/encirclement.js';
import { createJiraStore, fromSource, notFromSeen, openOn } from '../src/ngogo/store-jira.js';
import { createMemoryStore } from './memory-store.mjs';

const NOW = Date.parse('2026-11-17T09:00:00Z');
const TODAY = dayOfInstant(NOW);
const user = (n, type = 'atlassian', active = true) => ({ id: `u-${n}`, name: n, type, active });
const nadia = user('Nadia');
const bot = user('Automation', 'app');
const bot2 = user('Importer', 'app');
const mk = (key, project, assignee, reporter, extra = {}) => ({ key, project, assignee, reporter, due: null, comments: [], ...extra });

const ISSUES = [
  ...Array.from({ length: 9 }, (_, i) => mk(`OPS-${i}`, 'OPS', nadia, user(`r${i}`), { due: '2026-11-18' })),
  mk('OPS-50', 'OPS', user('Omar'), user('r0')),
  mk('HR-1', 'HR', nadia, bot),
  mk('OPS-60', 'OPS', user('Gone', 'atlassian', false), user('r0')),
  mk('OPS-70', 'OPS', null, user('r0')),
  mk('OPS-80', 'OPS', nadia, user('r0'), { done: true, due: '2026-11-01' }),
];

const comparable = (r) => ({
  open_requests: r.open_requests, pressure_bps: r.pressure_bps, ratio_centi: r.ratio_centi, state: r.state,
  sources: r.sources.map((s) => [s.key, s.kind, s.label, s.requests, s.weight_bps, s.nearest_due_days]),
  allies: r.allies,
});

test('issue panel: nine urgent requesters plus one queue on Nadia', async () => {
  const r = await issueEncirclement(createMemoryStore(ISSUES, { today: TODAY }), 'OPS-3', NOW);
  assert.equal(r.status, 'ok');
  assert.equal(r.person.name, 'Nadia');
  assert.equal(r.person.source_count, 10);
  assert.equal(r.person.pressure_bps, 95_000);
  assert.equal(r.person.state, 'cornered');
  assert.equal(r.person.open_requests, 10);
  assert.deepEqual(r.thisRequest, { selfRaised: false, source: { label: 'r3', kind: 'person', requests: 1 } });
  assert.equal(r.truncated, false);
});

test('issue panel: unassigned and unknown requests', async () => {
  const store = createMemoryStore(ISSUES, { today: TODAY });
  assert.equal((await issueEncirclement(store, 'OPS-70', NOW)).status, 'unassigned');
  assert.equal((await issueEncirclement(store, 'NOPE-1', NOW)).status, 'not_found');
});

test('project page: people with open work in the project, pressure counted across projects, inactive accounts left out', async () => {
  const r = await projectOrganism(createMemoryStore(ISSUES, { today: TODAY }), 'OPS', NOW);
  assert.deepEqual(r.people.map((p) => [p.name, p.source_count, p.state]), [['Nadia', 10, 'cornered'], ['Omar', 1, 'calm']]);
});

test('ten thousand requests from one queue do not hide the other sources', async () => {
  const flood = Array.from({ length: 10_000 }, (_, i) => mk(`PLAT-${i}`, "PLAT", nadia, bot, { updatedDay: TODAY - 100 }));
  const store = createMemoryStore([...flood, ...ISSUES], { today: TODAY });
  const r = await personIndex(store, nadia, TODAY);
  assert.equal(r.open_requests, 10_010);
  assert.equal(r.source_count, 11);
  assert.equal(r.sources.find((s) => s.key === 'project:PLAT').requests, 10_000);
  assert.ok(store.calls.pageOpen <= 4, `discovery took ${store.calls.pageOpen} rounds`);
  assert.equal(r.truncated, false);
});

test('discovery by exclusion gives exactly the answer of reading every request', async () => {
  // A deterministic mixed bag: humans, two apps, missing reporters, self-raised, dated and undated, recent help.
  const projects = ['OPS', 'HR', 'FAC'];
  const lea = user('Lea');
  const bag = Array.from({ length: 700 }, (_, i) => {
    const reporter = i % 11 === 0 ? null : i % 7 === 0 ? bot : i % 13 === 0 ? bot2 : i % 17 === 0 ? nadia : user(`r${i % 23}`);
    const due = i % 5 === 0 ? null : `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
    const comments = i % 9 === 0 ? [{ author: i % 2 ? lea : user(`r${(i + 1) % 23}`), created: '2026-11-15T10:00:00Z' }] : [];
    // Only the requests somebody commented on were touched recently: 78 of them, one page.
    return mk(`${projects[i % 3]}-${i}`, projects[i % 3], nadia, reporter, { due, comments, updatedDay: comments.length ? TODAY - 2 : TODAY - 100 });
  });
  const full = encirclementOf(nadia, bag, TODAY);
  for (const pageSize of [100, 7, 1]) {
    const viaStore = await personIndex(createMemoryStore(bag, { pageSize: Math.max(pageSize, 1), today: TODAY }), nadia, TODAY);
    // Allies are read from one page of recent requests: compare them only when that page holds everything.
    const a = comparable(viaStore);
    const b = comparable(full);
    if (pageSize < 100) { delete a.allies; delete b.allies; a.ratio_centi = b.ratio_centi = 0; a.state = b.state = ''; }
    assert.deepEqual(a, b, `page size ${pageSize}`);
  }
});

test('the Jira store asks the questions that were checked against a real site', async () => {
  assert.equal(openOn('abc'), 'assignee = "abc" AND statusCategory != Done');
  assert.equal(fromSource({ kind: 'person', id: 'p1' }), 'reporter = "p1"');
  assert.equal(fromSource({ kind: 'queue', project: 'FAC', appIds: ['a1', 'a2'] }), 'project = "FAC" AND (reporter in ("a1", "a2") OR reporter is EMPTY)');
  assert.equal(fromSource({ kind: 'queue', project: 'FAC', appIds: [] }), 'project = "FAC" AND (reporter is EMPTY)');
  assert.deepEqual(notFromSeen({ reporterIds: ['me', 'p1'], queues: [{ project: 'FAC', appIds: ['a1'] }] }), [
    '(reporter not in ("me", "p1") OR reporter is EMPTY)',
    'NOT (project = "FAC" AND (reporter in ("a1") OR reporter is EMPTY))',
  ]);

  const sent = [];
  const post = async (path, body) => {
    sent.push([path, body]);
    return { ok: true, status: 200, json: async () => (path.endsWith('approximate-count') ? { count: 42 } : { issues: [] }) };
  };
  const store = createJiraStore(post);
  assert.equal(await store.countOpen('abc'), 42);
  assert.equal(await store.earliestDue('abc', { kind: 'person', id: 'p1' }), null);
  await store.recentOpen('abc', 14);
  await store.pageAssignees('OPS', ['x']);
  assert.deepEqual(sent.map(([p, b]) => [p.split('/').pop(), b.jql]), [
    ['approximate-count', 'assignee = "abc" AND statusCategory != Done'],
    ['jql', 'assignee = "abc" AND statusCategory != Done AND reporter = "p1" AND duedate is not EMPTY ORDER BY duedate ASC'],
    ['jql', 'assignee = "abc" AND statusCategory != Done AND updated >= -14d ORDER BY updated DESC'],
    ['jql', 'project = "OPS" AND statusCategory != Done AND assignee is not EMPTY AND assignee not in ("x")'],
  ]);
});

test('a failed Jira search is an error, never an empty answer', async () => {
  const store = createJiraStore(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  await assert.rejects(() => store.pageOpen('abc', { reporterIds: ['abc'], queues: [] }), /status 500/);
  assert.equal(await store.countOpen('abc'), null);
});
