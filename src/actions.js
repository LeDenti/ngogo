// Forge entry points of Ngogo's tools, for the Rovo agent and for outside MCP clients.
// Every Jira call is made as the person asking, so an agent can never be told more than that person may see.
import api, { assumeTrustedRoute } from '@forge/api';
import { createJiraStore } from './ngogo/store-jira.js';
import { createJiraNotes } from './ngogo/notes-jira.js';
import * as tools from './ngogo/tools.js';

// Paths come from this app's own code; keys are validated in tools.js and notes-jira.js before they reach a path.
const call = (method, path, body) =>
  api.asUser().requestJira(assumeTrustedRoute(path), {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const store = createJiraStore((path, body) => call('POST', path, body));
const notes = createJiraNotes(call);

// When the question is asked from a Jira page, Rovo passes where the person is.
const here = (payload) => payload?.context?.jira ?? {};
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : undefined);
const int = (v) => (typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : v);

// A tool must always answer with something a model can read: never let an exception escape as a blank.
const answer = (name, fn) => async (payload, context) => {
  try {
    return await fn(payload ?? {}, context ?? {});
  } catch (e) {
    console.error(`${name} failed: ${e?.message ?? e}`);
    return { ok: false, error: `Ngogo could not answer (${e?.message ?? 'unknown error'}).` };
  }
};

export const whoIsCornered = answer('who-is-cornered', (p) =>
  tools.whoIsCornered(store, { projectKey: text(p.projectKey) ?? here(p).projectKey }));

export const requestEncirclement = answer('request-encirclement', (p) =>
  tools.requestEncirclement(store, notes, { issueKey: text(p.issueKey) ?? here(p).issueKey }));

export const heldRequests = answer('held-requests', (p) =>
  tools.heldRequests(notes, { projectKey: text(p.projectKey) }));

export const releaseRequest = answer('release-request', (p, context) =>
  tools.releaseRequest(notes, { issueKey: text(p.issueKey) ?? here(p).issueKey }, context?.principal?.accountId ?? p?.context?.accountId ?? null));

export const advanceWhatIf = answer('advance-what-if', (p) =>
  tools.advanceWhatIf({
    poolCapital: int(p.poolCapital), debtorAlreadyOwes: int(p.debtorAlreadyOwes ?? 0), face: int(p.face), advance: int(p.advance),
    fee: int(p.fee ?? 0), daysUntilDue: int(p.daysUntilDue), afterADefault: p.afterADefault === true || p.afterADefault === 'true',
  }));
