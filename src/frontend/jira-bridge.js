// The store used by the screens: every call goes through the Forge bridge
// with the Jira session of the person looking at the page.
import { requestJira } from '@forge/bridge';
import { createJiraStore } from '../ngogo/store-jira.js';

const post = (path, body) =>
  requestJira(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });

export const store = createJiraStore(post);
