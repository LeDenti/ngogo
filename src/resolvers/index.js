// Backend of Ngogo for Jira.
//   selfTest    : proves the embedded Ferret decision engine agrees with its reference oracle
//   poolView    : the invoice-advance pool of the project being viewed
//   poolInvoice : what the pool says about the request being viewed
//   poolAct     : one operation on the pool (fund, ask an advance, repay, write off, buy back)
//   poolRequest : the same answer, for the customer looking at their request in the portal
// The encirclement index itself is computed in the browser, with the viewer's own Jira session
// (see src/ngogo/views.js and src/frontend/jira-bridge.js).
import Resolver from '@forge/resolver';
import { InvoicePool } from '../engine/invoices.js';
import sample from '../cases-sample.json';
import { kvs } from '@forge/kvs';
import api, { route } from '@forge/api';
import { newBook, act, view, invoiceView } from '../ngogo/pool.js';
import { dayOfInstant } from '../ngogo/encirclement.js';

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

// ---- The pool -------------------------------------------------------------------------------------
// One book per Jira project, kept in Forge storage as a journal of events and replayed on every read.
// The project and the request always come from the Forge context (where the person really is),
// never from what the screen sends: nobody can act on the pool of a project they cannot open.
const bookKey = (projectId) => `pool-${projectId}`;
const today = () => dayOfInstant(Date.now());
const loadBook = async (projectId) => (await kvs.get(bookKey(projectId))) ?? newBook(today());

// Who raised a request, and in which project it lives. Read as the app: the caller is already looking at it.
async function requestFacts(issueKey) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}?fields=reporter,project`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`could not read the request (${res.status})`);
  const f = (await res.json()).fields;
  return { projectId: f.project.id, supplier: f.reporter?.displayName ?? 'supplier' };
}

resolver.define('poolView', async ({ context }) => {
  const projectId = context.extension.project?.id;
  if (!projectId) return { ok: false, error: 'No project here.' };
  return { ok: true, pool: view(await loadBook(projectId), today()) };
});

resolver.define('poolInvoice', async ({ context }) => {
  const projectId = context.extension.project?.id;
  const issueKey = context.extension.issue?.key;
  if (!projectId || !issueKey) return { ok: false, error: 'No request here.' };
  const book = await loadBook(projectId);
  const v = view(book, today());
  return { ok: true, invoice: invoiceView(book, today(), issueKey), pool: { capital: v.capital, free_cash: v.free_cash, mood: v.mood, stress: v.stress, ceilings: v.ceilings } };
});

const PROJECT_OPS = new Set(['deposit', 'withdraw']);
const REQUEST_OPS = new Set(['advance', 'repay', 'default', 'buyback']);

resolver.define('poolAct', async ({ payload, context }) => {
  const projectId = context.extension.project?.id;
  const issueKey = context.extension.issue?.key;
  const op = String(payload?.op ?? '');
  if (!projectId) return { ok: false, error: 'No project here.' };
  if (!PROJECT_OPS.has(op) && !REQUEST_OPS.has(op)) return { ok: false, error: 'Unknown operation.' };
  if (REQUEST_OPS.has(op) && !issueKey) return { ok: false, error: 'This is done from a request.' };

  const input = { ...(payload?.input ?? {}) };
  if (REQUEST_OPS.has(op)) {
    input.invoice = issueKey; // the invoice IS the request being viewed
    if (op === 'advance') input.supplier = (await requestFacts(issueKey)).supplier;
  }
  const book = await loadBook(projectId);
  const { book: next, result } = act(book, today(), op, input, context.accountId);
  // Last write wins: two people acting in the same second on the same pool could lose one event.
  if (next !== book) await kvs.set(bookKey(projectId), next);
  const v = view(next, today());
  return {
    ...result,
    pool: v,
    invoice: issueKey ? invoiceView(next, today(), issueKey) : null,
  };
});

// The customer portal: a customer sees the pool's answer on their own request, and nothing else about the pool.
resolver.define('poolRequest', async ({ context }) => {
  const issueKey = context.extension.request?.key;
  if (!issueKey) return { ok: false, error: 'No request here.' };
  const { projectId } = await requestFacts(issueKey);
  return { ok: true, invoice: invoiceView(await loadBook(projectId), today(), issueKey) };
});

export const handler = resolver.getDefinitions();
