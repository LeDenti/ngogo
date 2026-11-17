import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBook, act, view, invoiceView, withoutPeople, MAX_EVENTS } from '../src/ngogo/pool.js';

const D0 = 20_000; // any day number
const ask = (extra = {}) => ({ invoice: 'FIN-1', debtor: 'Acme', face: 5_000, advance: 4_500, fee: 50, days: 30, analysis: true, ...extra });
// Runs a list of [day offset, op, input, who] and returns the book and every result.
function run(steps, book = newBook(D0)) {
  const results = [];
  for (const [day, op, input] of steps) {
    const r = act(book, D0 + day, op, input);
    book = r.book;
    results.push(r.result);
  }
  return { book, results };
}

test('a funded pool advances on a checked invoice, and the book shows it', () => {
  const { book, results } = run([[0, 'deposit', { amount: 20_000 }], [1, 'advance', ask()]]);
  assert.deepEqual(results.map((r) => [r.accepted, r.reason]), [[true, null], [true, null]]);
  const v = view(book, D0 + 1);
  assert.deepEqual([v.capital, v.free_cash, v.outstanding, v.mood], [20_000, 15_500, 4_500, 'calm']);
  assert.deepEqual(v.exposures, [{ debtor: 'acme', owed: 4_550 }]);
  assert.deepEqual(v.advances[0], {
    invoice: 'FIN-1', debtor: 'acme', face: 5_000, advance: 4_500, fee: 50, repaid: 0, still_owed: 4_550,
    status: 'funded', due_in_days: 30, can_be_written_off_in_days: 37,
  });
  assert.equal(v.log.at(-1).text, 'An advance of 4500 is asked on invoice FIN-1 of 5000 owed by acme, due in 30 days: accepted.');
});

test('every refusal comes with its reason in plain words, and is journalled', () => {
  const { book, results } = run([
    [0, 'deposit', { amount: 20_000 }],
    [1, 'advance', ask({ analysis: false })],
    [1, 'advance', ask({ advance: 4_900 })],
    [1, 'advance', ask()],
    [1, 'advance', ask({ invoice: 'FIN-2' })],          // Acme would owe 9 100 of 20 000: above 30 %
    [1, 'advance', ask({ invoice: 'FIN-3', debtor: 'Globex', days: 200 })],
  ]);
  assert.deepEqual(results.map((r) => r.reason), [null, 'analysis_required', 'advance_above_cap', null, 'concentration_breached', 'term_too_long']);
  assert.equal(results[4].why, 'this debtor would owe a larger share of the pool than it accepts in its current mood');
  assert.equal(book.events.length, 6);
  assert.match(view(book, D0 + 1).log[4].text, /refused, this debtor would owe a larger share/);
  // Two ceiling refusals (advance share, concentration) each moved the mood: the journal is the whole truth.
  assert.equal(view(book, D0 + 1).stress, '10.00 %');
});

test('repaid in full by default; a default makes the pool wary and its ceilings tighter; a buyback heals the loss', () => {
  const steps = [[0, 'deposit', { amount: 20_000 }], [1, 'advance', ask()], [1, 'advance', ask({ invoice: 'FIN-9', debtor: 'Globex', advance: 2_000, face: 3_000, fee: 20, days: 10 })]];
  const paid = run([...steps, [20, 'repay', { invoice: 'FIN-1' }]]);
  assert.deepEqual(paid.results.at(-1).detail, { closed: true, to_pool: 4_550, to_supplier: 0 });
  assert.equal(view(paid.book, D0 + 20).fees_earned, 50);

  const early = run([...steps, [12, 'default', { invoice: 'FIN-9' }]]);
  assert.deepEqual([early.results.at(-1).accepted, early.results.at(-1).why], [false, 'the grace period after the due date is not over']);

  const lost = run([...steps, [19, 'default', { invoice: 'FIN-9' }]]);
  const v = view(lost.book, D0 + 19);
  assert.deepEqual([v.mood, v.losses, v.capital], ['wary', 2_000, 18_000]);
  assert.ok(v.ceilings.longest_term_days < v.ceilings.calm_longest_term_days);
  assert.equal(v.advances.find((a) => a.invoice === 'FIN-9').status, 'defaulted');
  // With time and no new trouble, the mood fades back.
  assert.equal(view(lost.book, D0 + 80).mood, 'calm');

  const healed = run([[20, 'buyback', { invoice: 'FIN-9' }]], lost.book);
  assert.equal(view(healed.book, D0 + 20).losses, 0);
});

test('nothing reaches the engine unchecked', () => {
  const funded = run([[0, 'deposit', { amount: 20_000 }]]).book;
  for (const bad of [{ face: 1.5 }, { advance: -1 }, { fee: '10' }, { days: null }, { debtor: '   ' }, { invoice: '' }, { face: 2_000_000_000 }]) {
    const r = act(funded, D0, 'advance', ask(bad));
    assert.equal(r.result.ok, false, JSON.stringify(bad));
    assert.equal(r.book, funded); // invalid input never enters the journal
  }
  assert.equal(act(funded, D0, 'deposit', { amount: 0 }).result.ok, false);
  assert.equal(act(funded, D0, 'steal', {}).result.ok, false);
  // Debtor names are folded, so "ACME " and "acme" are one debtor for the concentration ceiling.
  const two = run([[0, 'advance', ask({ debtor: '  ACME ' })], [0, 'advance', ask({ invoice: 'FIN-2', debtor: 'acme' })]], funded);
  assert.deepEqual(two.results.map((r) => r.reason), [null, 'concentration_breached']);
});

test('the same journal always gives the same pool, and the clock never goes back', () => {
  const { book } = run([[0, 'deposit', { amount: 20_000 }], [5, 'advance', ask()], [2, 'advance', ask({ invoice: 'FIN-2', debtor: 'Globex' })]]);
  assert.deepEqual(book.events.map((e) => e.t), [0, 5, 5]);
  assert.deepEqual(view(book, D0 + 5), view(JSON.parse(JSON.stringify(book)), D0 + 5));
  assert.equal(view(book, D0 - 3).day, 5);
});

test('a request is told only about itself', () => {
  const { book } = run([
    [0, 'deposit', { amount: 20_000 }], [1, 'advance', ask()],
    [1, 'advance', ask({ invoice: 'FIN-2' })], [2, 'advance', ask({ invoice: 'FIN-2', advance: 1_000 })],
  ]);
  const mine = invoiceView(book, D0 + 2, 'FIN-2');
  assert.deepEqual(Object.keys(mine), ['invoice', 'advance', 'last_answer', 'pool_mood']);
  assert.deepEqual([mine.last_answer.accepted, mine.last_answer.asked, mine.advance.status], [true, 1_000, 'funded']);
  const refused = invoiceView(run([[3, 'advance', ask({ invoice: 'FIN-7', advance: 4_900 })]], book).book, D0 + 3, 'FIN-7');
  assert.deepEqual([refused.advance, refused.last_answer.reason], [null, 'advance_above_cap']);
  assert.deepEqual(invoiceView(book, D0 + 2, 'FIN-404'), { invoice: 'FIN-404', advance: null, last_answer: null, pool_mood: 'calm' });
});

test('a full book says so instead of growing', () => {
  const book = { ...newBook(D0), events: Array.from({ length: MAX_EVENTS }, () => ({ t: 0, op: 'deposit', args: { lender: 'members', amount: 1 } })) };
  const r = act(book, D0, 'deposit', { amount: 1 });
  assert.deepEqual([r.result.ok, r.book.events.length], [false, MAX_EVENTS]);
});

test('the journal stores no account id and no name, and an older journal is cleaned without changing the pool', () => {
  const { book } = run([[0, 'deposit', { amount: 20_000 }], [1, 'advance', ask()], [20, 'repay', { invoice: 'FIN-1' }], [21, 'withdraw', {}]]);
  assert.deepEqual([...new Set(book.events.flatMap((e) => [e.args.lender, e.args.supplier, e.args.payer]).filter(Boolean))].sort(), ['members', 'payer', 'requester']);
  assert.equal(view(book, D0 + 21).capital, 0);

  const old = { v: 1, start_day: D0, events: [
    { t: 0, op: 'deposit', args: { lender: '712020:abc', amount: 20_000 } },
    { t: 1, op: 'advance', args: { invoice: 'FIN-1', supplier: 'Jane Doe', debtor: 'acme', face: 5_000, advance: 4_500, fee: 50, due: 31, analysis: true } },
    { t: 20, op: 'repay', args: { invoice: 'FIN-1', amount: 4_550, payer: '712020:abc' } },
  ] };
  const clean = withoutPeople(old);
  assert.doesNotMatch(JSON.stringify(clean), /712020|Jane/);
  assert.equal(withoutPeople(clean), clean);
  const strip = (v) => ({ ...v, log: v.log.map((l) => l.accepted) });
  assert.deepEqual(strip(view(clean, D0 + 20)), strip(view(old, D0 + 20)));
});
