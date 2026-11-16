// Backend of the Ngogo issue panel (first trial build).
// It proves one thing: the Ferret decision engine runs inside the Forge runtime
// and gives exactly the same answers as its Python reference oracle.
import Resolver from '@forge/resolver';
import { InvoicePool } from '../engine/invoices.js';
import sample from '../cases-sample.json';

const resolver = new Resolver();

// Replays the bundled subset of ferret's case file and counts any disagreement.
// Each step is checked twice: the decision (ok / refuse + family) and the full snapshot after it.
resolver.define('selfTest', () => {
  const started = Date.now();
  let steps = 0;
  const mismatches = [];
  for (const sc of sample.scenarios) {
    const pool = new InvoicePool(sc.pool_policy, sc.mood_policy);
    for (const st of sc.steps) {
      const d = pool.apply(st.op, st.t, st.args);
      const got = d.decision === 'refuse' ? `refuse:${d.family}` : 'ok';
      const want = st.expect.decision === 'refuse' ? `refuse:${st.expect.family}` : 'ok';
      const sameSnapshot = JSON.stringify(pool.snapshot()) === JSON.stringify(st.after);
      if (got !== want || !sameSnapshot) mismatches.push(`${sc.id} step ${st.i}: ${got} vs ${want}`);
      steps++;
    }
  }
  return {
    scenarios: sample.scenarios.length,
    steps,
    families: sample.families.length,
    mismatches: mismatches.slice(0, 5),
    mismatchCount: mismatches.length,
    ms: Date.now() - started,
  };
});

// A short story told by the engine: a pool is funded, one supplier asks too much of one debtor,
// an advance defaults, and the mood tightens the ceilings. Returned as a field log.
resolver.define('story', () => {
  const pool = new InvoicePool();
  const log = [];
  const step = (t, op, args, said) => {
    const d = pool.apply(op, t, args);
    const s = pool.snapshot();
    log.push({ t, said, decision: d.decision === 'ok' ? 'ok' : `refused (${d.family})`, mood: s.mood, stress: s.stress_bps });
  };
  step(0, 'deposit', { lender: 'Team', amount: 20000 }, 'The team puts 20,000 in the pot');
  step(1, 'advance', { invoice: 'A-1', supplier: 'Nadia', debtor: 'Acme', face: 5000, advance: 4500, fee: 50, due: 30, analysis: true }, 'Nadia asks 4,500 on an Acme invoice');
  step(2, 'advance', { invoice: 'A-2', supplier: 'Nadia', debtor: 'Acme', face: 5000, advance: 4500, fee: 50, due: 30, analysis: true }, 'Nadia asks 4,500 more on Acme');
  step(40, 'default', { invoice: 'A-1' }, 'Acme never pays the first one');
  step(41, 'advance', { invoice: 'B-1', supplier: 'Omar', debtor: 'Globex', face: 3000, advance: 2700, fee: 30, due: 121, analysis: true }, 'Omar asks 2,700 on a Globex invoice due in 80 days (the calm ceiling is 90)');
  return log;
});

export const handler = resolver.getDefinitions();
