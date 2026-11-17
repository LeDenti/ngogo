// Forge entry points of the membrane. They run as the app, with no user present:
//   onIssueEvent : a request was created or assigned
//   sweepHeld    : every hour, release what should no longer be held
import api, { assumeTrustedRoute } from '@forge/api';
import { createJiraStore } from './ngogo/store-jira.js';
import { createJiraNotes } from './ngogo/notes-jira.js';
import { onRequest, sweep } from './ngogo/membrane-run.js';

// Every path comes from this app's own code; issue keys are validated in notes-jira.js before they reach a path.
const call = (method, path, body) =>
  api.asApp().requestJira(assumeTrustedRoute(path), {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const store = createJiraStore((path, body) => call('POST', path, body));
const notes = createJiraNotes(call);

export async function onIssueEvent(event) {
  const key = event?.issue?.key;
  if (!key) return;
  const kind = String(event.eventType ?? '').includes(':assigned:') ? 'assigned' : 'created';
  const result = await onRequest(store, notes, key, Date.now(), { event: kind });
  // Counts and reasons only: no names in the logs.
  console.log(`membrane ${key} ${kind}: ${result.action} (${result.reason ?? 'cornered'})`);
}

export async function sweepHeld() {
  const released = await sweep(store, notes);
  console.log(`membrane sweep: ${released.length} released`);
}
