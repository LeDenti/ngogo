import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PARAMS, dayOfDate, dayOfInstant, urgencyBps, sourceOf,
  encirclementOf, encirclementOfAll, formatRatio,
} from '../src/ngogo/encirclement.js';

const TODAY = dayOfDate('2026-11-17');
const nadia = { id: 'u-nadia', name: 'Nadia', type: 'atlassian' };
const human = (n) => ({ id: `u-${n}`, name: n, type: 'atlassian' });
const bot = { id: 'app-1', name: 'Automation for Jira', type: 'app' };
const issue = (key, reporter, extra = {}) => ({ key, project: 'OPS', assignee: nadia, reporter, due: null, comments: [], ...extra });
const comment = (author, created) => ({ author, created });

test('nobody asks, nobody is cornered', () => {
  const r = encirclementOf(nadia, [], TODAY);
  assert.equal(r.ratio_centi, 0);
  assert.equal(r.state, 'calm');
  assert.equal(r.source_count, 0);
});

test('nine urgent requesters, no ally: nine to one, cornered', () => {
  const issues = Array.from({ length: 9 }, (_, i) => issue(`OPS-${i}`, human(`r${i}`), { due: '2026-11-18' }));
  const r = encirclementOf(nadia, issues, TODAY);
  assert.equal(r.source_count, 9);
  assert.equal(r.pressure_bps, 90_000);
  assert.equal(r.ratio_centi, 900);
  assert.equal(r.state, 'cornered');
  // One ally halves it: the lever the panel shows.
  assert.equal(r.ratio_with_one_more_ally_centi, 450);
  assert.equal(r.state_with_one_more_ally, 'wary');
});

test('the default thresholds are 3 and 8', () => {
  const mk = (n) => encirclementOf(nadia, Array.from({ length: n }, (_, i) => issue(`K-${i}`, human(`r${i}`), { due: '2026-11-17' })), TODAY);
  assert.equal(mk(2).state, 'calm');
  assert.equal(mk(3).state, 'wary');
  assert.equal(mk(7).state, 'wary');
  assert.equal(mk(8).state, 'cornered');
});

test('one requester with ten requests is one source, at its most urgent weight', () => {
  const r0 = human('r0');
  const issues = [
    ...Array.from({ length: 9 }, (_, i) => issue(`A-${i}`, r0, { due: '2027-06-01' })),
    issue('A-9', r0, { due: '2026-11-20' }),
  ];
  const r = encirclementOf(nadia, issues, TODAY);
  assert.equal(r.source_count, 1);
  assert.equal(r.sources[0].requests, 10);
  assert.equal(r.sources[0].weight_bps, 10_000);
  assert.equal(r.sources[0].nearest_due_days, 3);
  assert.equal(r.open_requests, 10);
});

test('urgency follows the days left; overdue is most urgent', () => {
  const w = DEFAULT_PARAMS.weight_bps;
  assert.equal(urgencyBps(TODAY - 400, TODAY, w), 10_000);
  assert.equal(urgencyBps(TODAY + 3, TODAY, w), 10_000);
  assert.equal(urgencyBps(TODAY + 4, TODAY, w), 8_000);
  assert.equal(urgencyBps(TODAY + 7, TODAY, w), 8_000);
  assert.equal(urgencyBps(TODAY + 14, TODAY, w), 6_000);
  assert.equal(urgencyBps(TODAY + 30, TODAY, w), 4_000);
  assert.equal(urgencyBps(TODAY + 31, TODAY, w), 2_000);
  assert.equal(urgencyBps(null, TODAY, w), 5_000);
});

test('a request you raised for yourself is not pressure', () => {
  const r = encirclementOf(nadia, [issue('S-1', nadia, { due: '2026-11-17' })], TODAY);
  assert.equal(r.source_count, 0);
  assert.equal(r.open_requests, 1);
});

test('requests raised by an app are attributed to their queue, one source per project', () => {
  const issues = [
    issue('FAC-1', bot, { project: 'FAC' }), issue('FAC-2', bot, { project: 'FAC' }),
    issue('HR-1', bot, { project: 'HR' }), issue('X-1', null, { project: 'FAC' }),
  ];
  const r = encirclementOf(nadia, issues, TODAY);
  assert.deepEqual(r.sources.map((s) => [s.key, s.kind, s.requests]), [
    ['project:FAC', 'queue', 3], ['project:HR', 'queue', 1],
  ]);
  assert.equal(sourceOf(issues[0]).label, 'FAC queue');
});

test('allies: recent, human, not the person, not the requester of that request', () => {
  const r0 = human('r0');
  const omar = human('omar');
  const lea = human('lea');
  const issues = [
    issue('A-1', r0, {
      due: '2026-11-17',
      comments: [
        comment(omar, '2026-11-16T10:00:00.000+0100'),   // ally
        comment(omar, '2026-11-10T10:00:00.000+0100'),   // same ally, second action
        comment(lea, '2026-10-01T10:00:00.000+0100'),    // too old
        comment(r0, '2026-11-16T10:00:00.000+0100'),     // the requester pushing is not help
        comment(nadia, '2026-11-16T10:00:00.000+0100'),  // herself
        comment(bot, '2026-11-16T10:00:00.000+0100'),    // an app
      ],
    }),
  ];
  const r = encirclementOf(nadia, issues, TODAY);
  assert.deepEqual(r.allies, [{ id: 'u-omar', name: 'omar', actions: 2 }]);
  assert.equal(r.ratio_centi, 50); // 1.00 of pressure shared by two
});

test('a requester on one ticket can be an ally on another', () => {
  const r0 = human('r0');
  const r1 = human('r1');
  const issues = [
    issue('A-1', r0, { due: '2026-11-17', comments: [comment(r1, dayOfInstant('2026-11-16T00:00:00Z') * 86_400_000)] }),
    issue('A-2', r1, { due: '2026-11-17' }),
  ];
  const r = encirclementOf(nadia, issues, TODAY);
  assert.equal(r.source_count, 2);
  assert.equal(r.ally_count, 1);
  assert.equal(r.ratio_centi, 100);
});

test('the window is a setting', () => {
  const issues = [issue('A-1', human('r0'), { comments: [comment(human('lea'), '2026-10-01T10:00:00Z')] })];
  assert.equal(encirclementOf(nadia, issues, TODAY).ally_count, 0);
  assert.equal(encirclementOf(nadia, issues, TODAY, { ...DEFAULT_PARAMS, window_days: 90 }).ally_count, 1);
});

test('everyone, most cornered first; unassigned requests corner nobody', () => {
  const omar = human('omar');
  const issues = [
    ...Array.from({ length: 4 }, (_, i) => issue(`N-${i}`, human(`r${i}`), { due: '2026-11-17' })),
    { ...issue('O-1', human('r0'), { due: '2026-11-17' }), assignee: omar },
    { ...issue('U-1', human('r0')), assignee: null },
  ];
  const all = encirclementOfAll(issues, TODAY);
  assert.deepEqual(all.map((p) => [p.name, p.ratio_centi, p.state]), [['Nadia', 400, 'wary'], ['omar', 100, 'calm']]);
});

test('same input, same output, whatever the order of the issues', () => {
  const issues = Array.from({ length: 6 }, (_, i) => issue(`K-${i}`, human(`r${i % 3}`), { due: i % 2 ? '2026-11-19' : null }));
  const a = encirclementOf(nadia, issues, TODAY);
  const b = encirclementOf(nadia, [...issues].reverse(), TODAY);
  assert.deepEqual({ ...a, sources: a.sources.map((s) => ({ ...s, issues: [...s.issues].sort() })) },
                   { ...b, sources: b.sources.map((s) => ({ ...s, issues: [...s.issues].sort() })) });
});

test('ratios print with two decimals', () => {
  assert.equal(formatRatio(733), '7.33');
  assert.equal(formatRatio(900), '9.00');
  assert.equal(formatRatio(5), '0.05');
});
