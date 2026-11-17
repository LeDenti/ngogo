// What the screens use to talk to Jira: every call goes through the Forge bridge
// with the Jira session of the person looking at the page.
import { requestJira } from '@forge/bridge';
import { createJiraStore } from '../ngogo/store-jira.js';
import { createJiraNotes } from '../ngogo/notes-jira.js';

const call = (method, path, body) =>
  requestJira(path, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export const store = createJiraStore((path, body) => call('POST', path, body));
export const notes = createJiraNotes(call);
