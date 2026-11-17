import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whoIsCornered, requestEncirclement, heldRequests, releaseRequest, advanceWhatIf } from '../src/ngogo/tools.js';
import { demoInitial, demoStep, DEMO_PROJECT } from '../src/ngogo/demo.js';
import { createMemoryStore, createMemoryNotes } from '../src/ngogo/store-memory.js';

const NOW = Date.parse('2026-11-17T12:00:00Z');
// The demo team, after one request too many for Nadia: a ready-made world for the tools.
async function world() {
  const s = demoInitial(NOW);
  await demoStep(s, 'request');
  return { s, store: createMemoryStore(s.issues, { today: s.today }), notes: createMemoryNotes(s.records, []) };
}

test('who is cornered: one sentence, then the people, most cornered first', async () => {
  const { store } = await world();
  const r = await whoIsCornered(store, { projectKey: DEMO_PROJECT }, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.summary, 'In TEAM, 1 person is cornered (Nadia) and 3 people are wary, out of 12 with open work.');
  assert.deepEqual(r.people[0], {
    name: 'Nadia', state: 'cornered', ratio: '8.70 : 1', independent_sources: 10, allies: [], open_requests: 18,
    main_sources: r.people[0].main_sources, ratio_with_one_more_ally: '4.35 : 1', state_with_one_more_ally: 'wary',
  });
  assert.equal(r.people[0].main_sources.length, 5);
  assert.match(r.rule, /never to rank them/);
  assert.equal(r.incomplete, false);
  assert.equal((await whoIsCornered(store, { projectKey: 'NOPE' }, NOW)).summary, 'Nobody has an open request assigned in NOPE.');
});

test('a request: who it lands on, where it comes from, and the hold notice', async () => {
  const { store, notes } = await world();
  const r = await requestEncirclement(store, notes, { issueKey: 'TEAM-61' }, NOW);
  assert.match(r.summary, /^Nadia is cornered at 8\.70 to 1: 10 independent sources, 0 allies, 18 open requests\. Ngogo holds TEAM-61 in incubation until 2026-11-19/);
  assert.equal(r.this_request_comes_from, 'Ines');
  assert.equal(r.held.state, 'incubating');
  // The tool holds no name of its own: the ally is named in the notice on the request, not in what Ngogo stores.
  assert.match(r.held.notice[1], /^Nadia is already pressed by 10 independent sources/);
  assert.match(r.held.notice[2], /proposed an ally in its notice/);
  const calm = await requestEncirclement(store, notes, { issueKey: 'TEAM-18' }, NOW);
  assert.equal(calm.held, null);
  assert.equal(calm.assignee.name, 'Omar');
  assert.equal((await requestEncirclement(store, notes, { issueKey: 'TEAM-999' }, NOW)).ok, false);
});

test('held requests, then a release by hand', async () => {
  const { store, notes } = await world();
  const before = await heldRequests(store, notes, {});
  assert.equal(before.summary, 'Ngogo holds 1 request in incubation.');
  assert.deepEqual(before.held[0], { request: 'TEAM-61', assignee: 'Nadia', held_since: before.held[0].held_since, held_until: before.held[0].held_until, ratio_when_held: '8.70 : 1', ally_proposed_in_the_notice: true });
  assert.equal((await heldRequests(store, notes, { projectKey: 'OTHER' })).held.length, 0);

  const r = await releaseRequest(notes, { issueKey: 'TEAM-61' }, NOW);
  assert.deepEqual([r.released, r.summary], [true, 'TEAM-61 is released from incubation. Its assignee was at 8.70 to 1 when it was held.']);
  assert.doesNotMatch(JSON.stringify(notes.records.get('TEAM-61')), /Nadia|Omar|demo-|acct/);
  assert.equal(notes.comments.length, 1);
  assert.equal((await releaseRequest(notes, { issueKey: 'TEAM-61' }, NOW)).released, false);
  assert.equal((await releaseRequest(notes, { issueKey: 'TEAM-1' }, NOW)).summary, 'Ngogo never held TEAM-1.');
  assert.equal((await heldRequests(store, notes, {})).summary, 'Ngogo holds nothing in incubation.');
});

test('nothing but real keys reaches Jira', async () => {
  const { store, notes } = await world();
  for (const bad of ['TEAM" OR project = "HR', 'team', '', undefined, 'TEAM-1']) assert.equal((await whoIsCornered(store, { projectKey: bad }, NOW)).ok, false);
  for (const bad of ['TEAM-1 OR 1=1', 'TEAM', '../x', undefined]) {
    assert.equal((await requestEncirclement(store, notes, { issueKey: bad }, NOW)).ok, false);
    assert.equal((await releaseRequest(notes, { issueKey: bad }, NOW)).ok, false);
  }
  assert.equal((await heldRequests(store, notes, { projectKey: 'x y' })).ok, false);
});

test('advance what-if: the same invoice, a calm pool and a wary one', () => {
  const ask = { poolCapital: 20_000, face: 3_000, advance: 2_700, fee: 30, daysUntilDue: 80 };
  const calm = advanceWhatIf(ask);
  assert.deepEqual([calm.decision, calm.reason, calm.mood], ['advance', null, 'calm (stress 0.00 %)']);
  assert.equal(calm.ceilings_now.longest_term_days, 90);
  const wary = advanceWhatIf({ ...ask, afterADefault: true });
  assert.deepEqual([wary.decision, wary.reason], ['refuse', 'term_too_long']);
  assert.match(wary.summary, /^No: the due date is further away than the pool accepts in its current mood\. The pool is wary\./);
  assert.ok(wary.ceilings_now.longest_term_days < 80);
  // A debtor who already owes a quarter of the pool cannot take much more.
  const full = advanceWhatIf({ ...ask, debtorAlreadyOwes: 5_000 });
  assert.deepEqual([full.decision, full.reason], ['refuse', 'concentration_breached']);
  assert.equal(advanceWhatIf({ ...ask, face: 2.5 }).ok, false);
  assert.equal(advanceWhatIf({ ...ask, poolCapital: -1 }).ok, false);
  assert.equal(advanceWhatIf({ ...ask, debtorAlreadyOwes: 19_000 }).ok, false);
});
