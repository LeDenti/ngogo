// Ngogo: the pool. The money side of the symbiosis.
//
// A supplier cornered by clients who pay late can ask a shared pool for an advance on an invoice.
// The decision is made by the Ferret engine (src/engine): twelve ordered checks, a yes or a no with a reason,
// and a mood that tightens the ceilings after a default and relaxes when advances are repaid.
//
// This file is the book around the engine. The book is a journal of events; the state is never stored,
// it is replayed from the journal, so the same journal always gives the same pool. Pure, no I/O.
// A book, not a bank: play numbers, no custody, no money moves.
import { InvoicePool } from '../engine/invoices.js';
import { formatRatio } from './encirclement.js';

export const MAX_EVENTS = 1_000;
const MAX_AMOUNT = 1_000_000_000;

/** A fresh book, opened today. */
export const newBook = (today) => ({ v: 1, start_day: today, events: [] });

export const WHY = {
  zero_amount: 'an amount is zero or negative',
  below_minimum: 'the invoice is below the minimum face value',
  duplicate_invoice: 'the pool already advanced on this invoice',
  analysis_required: 'nobody has confirmed that the invoice was checked',
  advance_above_face: 'the advance is larger than the invoice',
  fee_above_face: 'the fee is larger than the invoice',
  due_passed: 'the due date has already passed',
  term_too_long: 'the due date is further away than the pool accepts in its current mood',
  advance_above_cap: 'the advance is a larger share of the invoice than the pool accepts',
  concentration_breached: 'this debtor would owe a larger share of the pool than it accepts in its current mood',
  debtor_cap_breached: 'this debtor would owe more than the absolute ceiling',
  pool_illiquid: 'the pool does not have that much free cash',
  not_a_lender: 'this person has nothing in the pool',
  unknown_invoice: 'the pool never advanced on this invoice',
  not_funded: 'this advance is already closed',
  default_too_early: 'the grace period after the due date is not over',
  not_defaulted: 'this advance was not written off',
  unknown_op: 'the pool does not know this operation',
};

const whole = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_AMOUNT;
const label = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

function replay(book) {
  const pool = new InvoicePool();
  for (const e of book.events) pool.apply(e.op, e.t, e.args);
  return pool;
}

/** Turns what a screen sent into exact engine arguments, or says what is wrong. Nothing reaches the engine unchecked. */
function prepare(pool, op, input, t, who) {
  const bad = (error) => ({ error });
  if (op === 'deposit') {
    if (!whole(input.amount) || input.amount === 0) return bad('Give a whole amount above zero.');
    return { args: { lender: who, amount: input.amount } };
  }
  if (op === 'withdraw') return { args: { lender: who } };
  if (op === 'advance') {
    for (const k of ['face', 'advance', 'fee', 'days']) if (!whole(input[k])) return bad(`${k} must be a whole number.`);
    const debtor = label(input.debtor).toLowerCase();
    if (!debtor) return bad('Say who owes the invoice.');
    if (!label(input.invoice)) return bad('No invoice.');
    return {
      args: {
        invoice: label(input.invoice), supplier: label(input.supplier) || 'supplier', debtor,
        face: input.face, advance: input.advance, fee: input.fee, due: t + input.days, analysis: input.analysis === true,
      },
    };
  }
  if (op === 'repay') {
    const rec = pool.advances[label(input.invoice)];
    // Repaying in full is the common case: without an amount, pay what is still owed.
    const owed = rec ? rec.advance + rec.fee - rec.repaid : 0;
    const amount = input.amount === undefined || input.amount === null ? owed : input.amount;
    if (!whole(amount)) return bad('amount must be a whole number.');
    return { args: { invoice: label(input.invoice), amount, payer: who } };
  }
  if (op === 'default') return { args: { invoice: label(input.invoice) } };
  if (op === 'buyback') return { args: { invoice: label(input.invoice), payer: who } };
  return bad('Unknown operation.');
}

/**
 * Applies one operation to the book.
 * Returns {book, result}: `book` is the new book (unchanged if the input was invalid), `result` says what happened.
 * Refusals by the engine ARE journalled: a refusal moves the mood, and the journal is the whole truth.
 */
export function act(book, today, op, input, who) {
  const t = Math.max(today - book.start_day, book.events.at(-1)?.t ?? 0); // the book's clock never goes back
  if (book.events.length >= MAX_EVENTS) return { book, result: { ok: false, error: 'This book is full. Start a new pool.' } };
  const pool = replay(book);
  const prepared = prepare(pool, op, input ?? {}, t, label(who) || 'someone');
  if (prepared.error) return { book, result: { ok: false, error: prepared.error } };

  const d = pool.apply(op, t, prepared.args);
  const next = { ...book, events: [...book.events, { t, op, args: prepared.args }] };
  const accepted = d.decision === 'ok';
  return {
    book: next,
    result: {
      ok: true,
      accepted,
      reason: accepted ? null : d.family,
      why: accepted ? null : WHY[d.family] ?? d.family,
      detail: accepted ? Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'decision')) : null,
    },
  };
}

const SAID = {
  deposit: (e) => `${e.amount} put into the pool`,
  withdraw: (e) => (e.decision === 'ok' ? `${e.paid} taken out of the pool` : 'A withdrawal was asked'),
  advance: (e) => `${e.supplier} asks ${e.advance} on invoice ${e.invoice} of ${e.face} owed by ${e.debtor}, due in ${e.due - e.t} days`,
  repay: (e) => `${e.amount} repaid on ${e.invoice}`,
  default: (e) => `${e.invoice} is written off as unpaid`,
  buyback: (e) => `${e.invoice} is bought back after its write-off`,
};

/** What the screens show: the pool now, its advances, and its journal in plain words. */
export function view(book, today) {
  const pool = replay(book);
  const t = Math.max(today - book.start_day, book.events.at(-1)?.t ?? 0);
  const log = pool.journal.map((e) => ({
    day: e.t,
    text: `${(SAID[e.op] ?? (() => e.op))(e)}: ${e.decision === 'ok' ? 'accepted' : `refused, ${WHY[e.family] ?? e.family}`}.`,
    accepted: e.decision === 'ok',
    mood: e.mood,
  }));
  pool.mood.pass_time(t); // the mood fades with the days that passed since the last event
  const s = pool.snapshot();
  return {
    day: t,
    events: book.events.length,
    capital: s.capital,
    free_cash: s.capital - s.outstanding,
    outstanding: s.outstanding,
    losses: s.losses,
    fees_earned: s.fees_earned,
    lenders: Object.keys(s.lenders).length,
    mood: s.mood,
    stress: `${formatRatio(s.stress_bps)} %`,
    ceilings: {
      debtor_share: `${formatRatio(s.effective.share_bps)} %`,
      calm_debtor_share: `${formatRatio(pool.policy.max_share_bps)} %`,
      longest_term_days: s.effective.max_term,
      calm_longest_term_days: pool.policy.max_term,
      advance_share_of_invoice: `${formatRatio(pool.policy.max_advance_bps)} %`,
      grace_days: pool.policy.grace,
    },
    exposures: Object.entries(s.exposures).map(([debtor, owed]) => ({ debtor, owed })).sort((a, b) => b.owed - a.owed),
    advances: Object.entries(pool.advances).map(([invoice, r]) => ({
      invoice, supplier: r.supplier, debtor: r.debtor, face: r.face, advance: r.advance, fee: r.fee,
      repaid: r.repaid, still_owed: r.status === 'funded' ? r.advance + r.fee - r.repaid : 0,
      status: r.status, due_in_days: r.due - t, can_be_written_off_in_days: Math.max(0, r.due + pool.policy.grace - t),
    })),
    log,
  };
}

/** What one request is told about itself: the last word of the pool on that invoice, nothing about anyone else. */
export function invoiceView(book, today, invoice) {
  const v = view(book, today);
  const advance = v.advances.find((a) => a.invoice === invoice) ?? null;
  const pool = replay(book);
  const last = [...pool.journal].reverse().find((e) => e.op === 'advance' && e.invoice === invoice) ?? null;
  return {
    invoice,
    advance,
    last_answer: last
      ? { accepted: last.decision === 'ok', reason: last.family ?? null, why: last.family ? WHY[last.family] ?? last.family : null, asked: last.advance, face: last.face, day: last.t }
      : null,
    pool_mood: v.mood,
  };
}
