// Backend of Ngogo for Jira.
//   selfTest : proves the embedded Ferret decision engine agrees with its reference oracle
// The encirclement index itself is computed in the browser, with the viewer's own Jira session
// (see src/ngogo/views.js and src/frontend/jira-bridge.js).
import Resolver from '@forge/resolver';
import { InvoicePool } from '../engine/invoices.js';
import sample from '../cases-sample.json';

const resolver = new Resolver();

// Replays the bundled subset of ferret's case file and counts any disagreement.
resolver.define('selfTest', () => {
  const started = Date.now();
  let steps = 0;
  let mismatchCount = 0;
  for (const sc of sample.scenarios) {
    const pool = new InvoicePool(sc.pool_policy, sc.mood_policy);
    for (const st of sc.steps) {
      const d = pool.apply(st.op, st.t, st.args);
      const got = d.decision === 'refuse' ? `refuse:${d.family}` : 'ok';
      const want = st.expect.decision === 'refuse' ? `refuse:${st.expect.family}` : 'ok';
      if (got !== want || JSON.stringify(pool.snapshot()) !== JSON.stringify(st.after)) mismatchCount++;
      steps++;
    }
  }
  return { scenarios: sample.scenarios.length, steps, families: sample.families.length, mismatchCount, ms: Date.now() - started };
});

export const handler = resolver.getDefinitions();
