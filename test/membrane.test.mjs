import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOfInstant } from '../src/ngogo/encirclement.js';
import { membraneDecision, pickAlly, incubationRecord, releasedRecord, sweepDecision, incubationLines, incubationComment, withoutPeople, PROPERTY_KEY } from '../src/ngogo/membrane.js';
import { onRequest, sweep } from '../src/ngogo/membrane-run.js';
import { createJiraNotes } from '../src/ngogo/notes-jira.js';
import { createMemoryStore } from '../src/ngogo/store-memory.js';

const NOW = Date.parse('2026-11-17T09:00:00Z');
const TODAY = dayOfInstant(NOW);
const HOUR = 3_600_000;
const user = (n, type = 'atlassian', active = true) => ({ id: `u-${n}`, name: n, type, active });
const nadia = user('Nadia');
const omar = user('Omar');
const lea = user('Lea');
const mk = (key, project, assignee, reporter, extra = {}) => ({ key, project, assignee, reporter, due: null, comments: [], updatedDay: TODAY - 100, ...extra });

// Nadia: nine urgent requesters. Omar: one. Lea: three (wary).
const TEAM = [
  ...Array.from({ length: 9 }, (_, i) => mk(`OPS-${i}`, 'OPS', nadia, user(`r${i}`), { due: '2026-11-18' })),
  mk('OPS-50', 'OPS', omar, user('r0'), { due: '2026-11-18' }),
  ...Array.from({ length: 3 }, (_, i) => mk(`OPS-6${i}`, 'OPS', lea, user(`q${i}`), { due: '2026-11-18' })),
];

function memoryNotes() {
  const records = new Map();
  const comments = [];
  return {
    records, comments,
    async read(key) { return records.get(key) ?? null; },
    async write(key, r) { records.set(key, r); },
    async comment(key, body) { comments.push([key, body]); },
    async listIncubating() { return [...records].filter(([, r]) => r.state === 'incubating').map(([k]) => k); },
  };
}
const text = (adf) => adf.content.map((b) => b.content.map((t) => t.text).join('')).join('\n');

test('the decision: hold only an outside request landing on a cornered person, once', () => {
  const issue = mk('A-1', 'OPS', nadia, user('r0'));
  assert.deepEqual(membraneDecision(issue, { state: 'cornered' }, null), { action: 'incubate', reason: 'cornered' });
  assert.equal(membraneDecision(issue, { state: 'wary' }, null).reason, 'not_cornered');
  assert.equal(membraneDecision({ ...issue, assignee: null }, { state: 'cornered' }, null).reason, 'unassigned');
  assert.equal(membraneDecision({ ...issue, reporter: nadia }, { state: 'cornered' }, null).reason, 'self_raised');
  assert.equal(membraneDecision(issue, { state: 'cornered' }, { state: 'released' }).reason, 'already_decided');
  assert.equal(membraneDecision(issue, { state: 'cornered' }, { state: 'incubating' }).reason, 'already_decided');
});

test('the ally is the calmest colleague; nobody calm means nobody proposed', () => {
  const c = (n, state, ratio_centi, open_requests) => ({ id: `u-${n}`, name: n, state, ratio_centi, open_requests });
  assert.deepEqual(pickAlly(nadia, [c('Lea', 'wary', 300, 3), c('Omar', 'calm', 100, 9), c('Ines', 'calm', 100, 2), c('Nadia', 'calm', 0, 0)]),
    { id: 'u-Ines', name: 'Ines', ratio_centi: 100 });
  assert.equal(pickAlly(nadia, [c('Lea', 'wary', 300, 3)]), null);
});

test('a tenth request on Nadia is held, explained on the request, with Omar proposed', async () => {
  const issues = [...TEAM, mk('OPS-99', 'OPS', nadia, user('r9'), { due: '2026-11-19' })];
  const notes = memoryNotes();
  const r = await onRequest(createMemoryStore(issues, { today: TODAY }), notes, 'OPS-99', NOW);
  assert.equal(r.action, 'incubate');
  const rec = notes.records.get('OPS-99');
  assert.equal(rec.state, 'incubating');
  assert.equal(rec.ratio_centi, 1000);
  assert.equal(rec.source_count, 10);
  assert.equal(rec.until, new Date(NOW + 48 * HOUR).toISOString());
  assert.deepEqual([rec.ally_proposed, rec.ally_ratio_centi, r.ally], [true, 100, 'Omar']);
  // What Ngogo stores about the hold says nothing about anyone: counts and dates only.
  assert.deepEqual(Object.keys(rec).sort(), ['ally_count', 'ally_proposed', 'ally_ratio_centi', 'cornered_centi', 'ratio_centi', 'since', 'source_count', 'state', 'until', 'v']);
  assert.doesNotMatch(JSON.stringify(rec), /Nadia|Omar|u-/);
  assert.equal(notes.comments.length, 1);
  const said = text(notes.comments[0][1]);
  assert.match(said, /holding this request in incubation until 2026-11-19 09:00 UTC/);
  assert.match(said, /Nadia is already pressed by 10 independent sources with 0 people acting alongside: 10\.00 to 1/);
  assert.match(said, /Nothing is refused/);
  assert.match(said, /Omar has the lightest load/);
  // The notice names no requester.
  assert.doesNotMatch(said, /r\d/);
});

test('the same event twice holds once and comments once', async () => {
  const issues = [...TEAM, mk('OPS-99', 'OPS', nadia, user('r9'))];
  const notes = memoryNotes();
  const store = createMemoryStore(issues, { today: TODAY });
  await onRequest(store, notes, 'OPS-99', NOW);
  const again = await onRequest(store, notes, 'OPS-99', NOW + 1000);
  assert.equal(again.reason, 'already_decided');
  assert.equal(notes.comments.length, 1);
});

test('created and assigned arrive together at birth: only the creation speaks', async () => {
  const born = new Date(NOW - 3000).toISOString();
  const issues = [...TEAM, mk('OPS-99', 'OPS', nadia, user('r9'), { created: born })];
  const notes = memoryNotes();
  const store = createMemoryStore(issues, { today: TODAY });
  // Both events are handled at the same time, as Jira delivers them.
  const [a, b] = await Promise.all([
    onRequest(store, notes, 'OPS-99', NOW, { event: 'created' }),
    onRequest(store, notes, 'OPS-99', NOW, { event: 'assigned' }),
  ]);
  assert.equal(a.action, 'incubate');
  assert.equal(b.reason, 'covered_by_creation');
  assert.equal(notes.comments.length, 1);
  // A real reassignment, long after birth, is decided normally.
  const later = [...TEAM, mk('OPS-98', 'OPS', nadia, user('r8'), { created: new Date(NOW - 86_400_000).toISOString() })];
  const n2 = memoryNotes();
  assert.equal((await onRequest(createMemoryStore(later, { today: TODAY }), n2, 'OPS-98', NOW, { event: 'assigned' })).action, 'incubate');
});

test('two decisions racing on the same request write one notice', async () => {
  const issues = [...TEAM, mk('OPS-99', 'OPS', nadia, user('r9'), { created: new Date(NOW - 86_400_000).toISOString() })];
  const notes = memoryNotes();
  const store = createMemoryStore(issues, { today: TODAY });
  // The second decision starts while the first is still looking for an ally.
  const slow = { ...store, pageAssignees: async (...a) => { await new Promise((r) => setTimeout(r, 30)); return store.pageAssignees(...a); } };
  const first = onRequest(store, notes, 'OPS-99', NOW, { event: 'assigned' });
  const second = onRequest(slow, notes, 'OPS-99', NOW, { event: 'assigned' });
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual([a.action, b.reason], ['incubate', 'already_decided']);
  assert.equal(notes.comments.length, 1);
});

test('requests that are not held leave no trace', async () => {
  const issues = [...TEAM, mk('OPS-98', 'OPS', omar, user('r9')), mk('OPS-97', 'OPS', nadia, nadia), mk('OPS-96', 'OPS', null, user('r9'))];
  const notes = memoryNotes();
  const store = createMemoryStore(issues, { today: TODAY });
  assert.equal((await onRequest(store, notes, 'OPS-98', NOW)).reason, 'not_cornered');
  assert.equal((await onRequest(store, notes, 'OPS-97', NOW)).reason, 'self_raised');
  assert.equal((await onRequest(store, notes, 'OPS-96', NOW)).reason, 'unassigned');
  assert.equal((await onRequest(store, notes, 'NOPE-1', NOW)).reason, 'not_found');
  assert.equal(notes.records.size, 0);
  assert.equal(notes.comments.length, 0);
});

test('when nobody is calm the notice says it is a staffing question', async () => {
  const issues = [...TEAM.filter((i) => i.assignee.id !== omar.id), mk('OPS-99', 'OPS', nadia, user('r9'))];
  const notes = memoryNotes();
  await onRequest(createMemoryStore(issues, { today: TODAY }), notes, 'OPS-99', NOW);
  assert.equal(notes.records.get('OPS-99').ally_proposed, false);
  assert.match(text(notes.comments[0][1]), /staffing question, not a routing one/);
});

test('a slow search for an ally never blocks the hold', async () => {
  const issues = [...TEAM, mk('OPS-99', 'OPS', nadia, user('r9'))];
  const store = createMemoryStore(issues, { today: TODAY });
  const slow = { ...store, pageAssignees: () => new Promise((resolve) => setTimeout(() => resolve([]), 200)) };
  const notes = memoryNotes();
  const r = await onRequest(slow, notes, 'OPS-99', NOW, { allyBudgetMs: 10 });
  assert.equal(r.action, 'incubate');
  assert.equal(r.record.ally_proposed, false);
});

test('the sweep releases what is expired, relieved or reassigned, and keeps the rest', async () => {
  const rec = (sinceMs) => incubationRecord({ ratio_centi: 1000, source_count: 10, ally_count: 0 }, null, sinceMs, undefined, { cornered_centi: 800 });
  const issue = mk('A-1', 'OPS', nadia, user('r0'));
  assert.deepEqual(sweepDecision(rec(NOW), issue, { state: 'cornered' }, NOW + HOUR), { action: 'keep' });
  assert.deepEqual(sweepDecision(rec(NOW), issue, { state: 'wary' }, NOW + HOUR), { action: 'release', reason: 'relieved' });
  assert.deepEqual(sweepDecision(rec(NOW), issue, { state: 'cornered' }, NOW + 48 * HOUR), { action: 'release', reason: 'expired' });
  // Reassigned to someone calm: the index passed in is the new assignee's, and nobody cornered holds it any more.
  assert.deepEqual(sweepDecision(rec(NOW), { ...issue, assignee: omar }, { state: 'calm' }, NOW + HOUR), { action: 'release', reason: 'relieved' });
  assert.deepEqual(sweepDecision(rec(NOW), { ...issue, assignee: null }, null, NOW + HOUR), { action: 'release', reason: 'reassigned' });
  assert.deepEqual(sweepDecision(releasedRecord(rec(NOW), 'expired', NOW), issue, null, NOW + 99 * HOUR), { action: 'keep' });

  // End to end: two held requests on Nadia; one hour later nothing moves; an ally shows up; both are released.
  // A private copy: this scenario adds a comment, and must not leak into the other tests.
  const issues = structuredClone([...TEAM, mk('OPS-98', 'OPS', nadia, user('r8')), mk('OPS-99', 'OPS', nadia, user('r9'))]);
  const notes = memoryNotes();
  const store = createMemoryStore(issues, { today: TODAY });
  await onRequest(store, notes, 'OPS-98', NOW);
  await onRequest(store, notes, 'OPS-99', NOW);
  assert.deepEqual(await sweep(store, notes, NOW + HOUR), []);
  issues[0].comments.push({ author: omar, created: new Date(NOW).toISOString() });
  issues[0].updatedDay = TODAY;
  assert.deepEqual(await sweep(store, notes, NOW + 2 * HOUR), [{ key: 'OPS-98', reason: 'relieved' }, { key: 'OPS-99', reason: 'relieved' }]);
  assert.equal(notes.records.get('OPS-99').state, 'released');
  assert.match(text(notes.comments.at(-1)[1]), /released this request from incubation: nobody cornered holds it any more/);
  assert.deepEqual(await sweep(store, notes, NOW + 3 * HOUR), []);
});

test('Jira notes: exact paths, 404 means no record, and nothing but an issue key reaches a URL', async () => {
  const sent = [];
  const call = async (method, path, body) => {
    sent.push([method, path, body]);
    if (method === 'GET') return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ issues: [{ key: 'OPS-1' }] }) };
  };
  const notes = createJiraNotes(call);
  assert.equal(await notes.read('OPS-12'), null);
  await notes.write('OPS-12', { state: 'incubating' });
  await notes.comment('OPS-12', incubationComment({ until: '2026-11-19T09:00:00.000Z', source_count: 1, ally_count: 1, ratio_centi: 900, cornered_centi: 800, ally_proposed: false }, { person: 'N' }));
  assert.deepEqual(await notes.listIncubating(5), ['OPS-1']);
  assert.deepEqual(sent.map(([m, p]) => `${m} ${p}`), [
    `GET /rest/api/3/issue/OPS-12/properties/${PROPERTY_KEY}`,
    `PUT /rest/api/3/issue/OPS-12/properties/${PROPERTY_KEY}`,
    'POST /rest/api/3/issue/OPS-12/comment',
    'POST /rest/api/3/search/jql',
  ]);
  assert.equal(sent[3][2].jql, 'ngogoState = "incubating" ORDER BY created ASC');
  // Never e-mailed to a service desk customer.
  assert.deepEqual(sent[2][2].properties, [{ key: 'sd.public.comment', value: { internal: true } }]);
  for (const bad of ['OPS-1/../../user', 'ops-1', 'OPS-1?x=1', '', 'OPS-']) await assert.rejects(() => notes.read(bad), /not a Jira issue key/);
  assert.equal(incubationLines({ until: '2026-11-19T09:00:00.000Z', source_count: 1, ally_count: 1, ratio_centi: 900, cornered_centi: 800, ally_proposed: false }, { person: 'N' })[1].includes('N is already pressed by 1 independent source with 1 person acting'), true);
});

test('a record from an earlier version loses everything it said about people', async () => {
  const old = { v: 1, state: 'incubating', person: { id: 'u-nadia', name: 'Nadia' }, since: '2026-11-17T05:03:05.726Z', until: '2026-11-19T05:03:05.726Z',
    ratio_centi: 1500, source_count: 19, ally_count: 0, cornered_centi: 800, suggested_ally: { id: 'u-omar', name: 'Omar', ratio_centi: 60 }, released_by: 'acct' };
  const clean = withoutPeople(old);
  assert.doesNotMatch(JSON.stringify(clean), /Nadia|Omar|u-|acct/);
  assert.deepEqual([clean.v, clean.ally_proposed, clean.ally_ratio_centi, clean.ratio_centi], [2, true, 60, 1500]);
  assert.equal(withoutPeople(clean), clean);
  // Without a name to hand, the notice still reads, and points to the comment for the ally.
  assert.match(incubationLines(clean)[1], /^The assignee is already pressed by 19 independent sources/);
  assert.match(incubationLines(clean)[2], /proposed an ally in its notice/);
  // The sweep cleans such a record in place while it is still held.
  const issues = [...TEAM, mk('OPS-99', 'OPS', nadia, user('r9'))];
  const notes = memoryNotes();
  notes.records.set('OPS-99', { ...old, until: new Date(NOW + 24 * HOUR).toISOString() });
  await sweep(createMemoryStore(issues, { today: TODAY }), notes, NOW);
  assert.doesNotMatch(JSON.stringify(notes.records.get('OPS-99')), /Nadia|Omar|u-|acct/);
  assert.equal(notes.records.get('OPS-99').state, 'incubating');
});
