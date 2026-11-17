// Where the membrane writes: one issue property per held request, and comments.
// Transport-agnostic like the store: `call(method, path, body)` resolves to {ok, status, json()}.
import { PROPERTY_KEY } from './membrane.js';

const KEY = /^[A-Z][A-Z0-9_]{0,30}-[0-9]{1,12}$/;
// The issue key goes into a URL path: accept nothing that is not exactly a Jira issue key.
const safe = (key) => {
  if (!KEY.test(String(key))) throw new Error('not a Jira issue key');
  return key;
};
const propertyPath = (key) => `/rest/api/3/issue/${safe(key)}/properties/${PROPERTY_KEY}`;

const INTERNAL = [{ key: 'sd.public.comment', value: { internal: true } }];

export function createJiraNotes(call) {
  return {
    /** The incubation record of a request, or null. */
    async read(key) {
      const res = await call('GET', propertyPath(key));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`reading the incubation record failed with status ${res.status}`);
      return (await res.json()).value ?? null;
    },
    async write(key, record) {
      const res = await call('PUT', propertyPath(key), record);
      if (!res.ok) throw new Error(`writing the incubation record failed with status ${res.status}`);
    },
    /**
     * Adds a comment. On Jira Service Management requests a comment made through the API is public
     * by default, and would be e-mailed to the customer: Ngogo's notices talk about a colleague's load,
     * so they are always marked internal. The property is ignored on other kinds of projects.
     */
    async comment(key, body) {
      const res = await call('POST', `/rest/api/3/issue/${safe(key)}/comment`, { body, properties: INTERNAL });
      if (!res.ok) throw new Error(`commenting failed with status ${res.status}`);
    },
    /** Keys of the requests currently held (uses the searchable alias declared in the manifest). */
    async listIncubating(limit = 25) {
      const res = await call('POST', '/rest/api/3/search/jql', { jql: 'ngogoState = "incubating" ORDER BY created ASC', fields: ['project'], maxResults: limit });
      if (!res.ok) throw new Error(`listing held requests failed with status ${res.status}`);
      return ((await res.json()).issues ?? []).map((i) => i.key);
    },
  };
}
