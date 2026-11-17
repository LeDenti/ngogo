// The demo organisation: a simulated team of twelve and sixty requests, so that Ngogo can be tried
// on a site with no data. Nothing here touches Jira. The index, the membrane and the sweep that run
// on this team are the very same functions that run on live Jira; only the store is in memory.
//
// Deterministic: no randomness, every date is counted from "today", so the story is the same every day.
import { dayOfInstant } from './encirclement.js';
import { createMemoryStore, createMemoryNotes } from './store-memory.js';
import { projectOrganism } from './views.js';
import { onRequest, sweep } from './membrane-run.js';
import { incubationLines } from './membrane.js';

export const DEMO_PROJECT = 'TEAM';
const DAY_MS = 86_400_000;
const NAMES = ['Nadia', 'Omar', 'Lea', 'Ines', 'Tom', 'Aiko', 'Sam', 'Ravi', 'Zoe', 'Malik', 'Elsa', 'Hugo'];
const person = (name) => ({ id: `demo-${name.toLowerCase()}`, name, type: 'atlassian', active: true });
const PEOPLE = Object.fromEntries(NAMES.map((n) => [n, person(n)]));
const APP = { id: 'demo-automation', name: 'Automation', type: 'app', active: true };

const ymd = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const noon = (day) => day * DAY_MS + 12 * 3_600_000;

// [assignee, requester, days until due (null = no due date), project if not TEAM, how many identical requests]
// "auto" = raised by an automation: the source is then the queue of the project it lives in.
const REQUESTS = [
  // Nadia: nine sources, nobody alongside. 7.70 to 1: wary, one request away from cornered.
  ['Nadia', 'Tom', 1], ['Nadia', 'Tom', 9], ['Nadia', 'Aiko', 2], ['Nadia', 'Sam', 3], ['Nadia', 'Ravi', 0],
  ['Nadia', 'Zoe', -2], ['Nadia', 'Malik', 6], ['Nadia', 'Malik', 20], ['Nadia', 'Elsa', 7], ['Nadia', 'Hugo', 12],
  ['Nadia', 'auto', null, 'PAY', 6], ['Nadia', 'Nadia', 5],
  // Omar: one requester. The calmest of the team.
  ['Omar', 'Lea', 10], ['Omar', 'Omar', null],
  // Lea: five sources, nobody alongside: wary.
  ['Lea', 'Tom', 2], ['Lea', 'Tom', 25, undefined, 3], ['Lea', 'Aiko', 5], ['Lea', 'Zoe', 1], ['Lea', 'Hugo', 3], ['Lea', 'Ravi', null],
  // Ines: seven sources, more than Lea, but two people act alongside her: calm. That is the symbiosis.
  ['Ines', 'Sam', 2], ['Ines', 'Malik', 4], ['Ines', 'Elsa', 1], ['Ines', 'Ravi', 3], ['Ines', 'Hugo', 2], ['Ines', 'Zoe', 6],
  ['Ines', 'auto', null, 'IT', 4],
  ['Tom', 'Nadia', 8], ['Tom', 'Lea', 15],
  ['Aiko', 'Omar', 30], ['Aiko', 'Ines', null],
  ['Sam', 'Tom', 2], ['Sam', 'Aiko', 3], ['Sam', 'Elsa', 1], ['Sam', 'Elsa', 40, undefined, 2],
  ['Ravi', 'Zoe', 20],
  ['Zoe', 'Sam', 4], ['Zoe', 'Hugo', 9], ['Zoe', 'Hugo', 45, undefined, 2],
  ['Malik', 'Lea', 2], ['Malik', 'Ines', 3], ['Malik', 'Tom', 1], ['Malik', 'Omar', 5], ['Malik', 'Omar', 50, undefined, 2],
  ['Elsa', 'Malik', 14], ['Elsa', 'auto', null, 'IT'],
  ['Hugo', 'Aiko', 7],
];
// Who helped whom recently: [who, on the n-th request of that assignee, how many days ago]
const HELP = [['Omar', 'Ines', 0, 1], ['Tom', 'Ines', 2, 4]];

/** The team as it stands this morning. */
export function demoInitial(nowMs = Date.now()) {
  const today = dayOfInstant(nowMs);
  const issues = [];
  let n = 0;
  for (const [assignee, requester, due, project = DEMO_PROJECT, count = 1] of REQUESTS) {
    for (let k = 0; k < count; k++) {
      n += 1;
      issues.push({
        key: `${project}-${n}`,
        project,
        assignee: PEOPLE[assignee],
        reporter: requester === 'auto' ? APP : PEOPLE[requester],
        due: due === null ? null : ymd(today + due),
        created: new Date(noon(today - 20)).toISOString(),
        comments: [],
        updatedDay: today - 20,
      });
    }
  }
  for (const [who, assignee, nth, daysAgo] of HELP) {
    const target = issues.filter((i) => i.assignee.name === assignee)[nth];
    target.comments.push({ author: PEOPLE[who], created: new Date(noon(today - daysAgo)).toISOString() });
    target.updatedDay = today - daysAgo;
  }
  return { today, issues, records: new Map(), seq: n, extra: 0, log: [{ day: 0, text: 'Monday morning. Sixty open requests across a team of twelve.' }], start: today };
}

const storeOf = (state) => createMemoryStore(state.issues, { today: state.today });
const notesOf = (state) => createMemoryNotes(state.records, []);
const say = (state, text) => state.log.push({ day: state.today - state.start, text });

/** The index of everyone in the team, and the requests currently held. */
export async function demoView(state) {
  const organism = await projectOrganism(storeOf(state), DEMO_PROJECT, noon(state.today));
  const held = [...state.records]
    .filter(([, r]) => r.state === 'incubating')
    .map(([key, r]) => ({ key, lines: incubationLines(r) }));
  return { ...organism, held, log: state.log, day: state.today - state.start, requests: state.issues.length };
}

async function runSweep(state) {
  for (const { key, reason } of await sweep(storeOf(state), notesOf(state), noon(state.today))) {
    const why = { relieved: 'Nadia is no longer cornered', expired: 'the holding time is over', reassigned: 'it was reassigned' }[reason] ?? reason;
    say(state, `Ngogo releases ${key}: ${why}.`);
  }
}

// People who can still become a new source for Nadia, in the order they show up.
const NEXT_REQUESTERS = ['Ines', 'Omar', 'Lea'];

/**
 * One step of the story. Returns the same state object, changed.
 *   'request' : one more colleague sends Nadia an urgent request
 *   'ally'    : Omar acts on one of Nadia's requests
 *   'days'    : two days pass
 */
export async function demoStep(state, action) {
  const nadia = PEOPLE.Nadia;
  if (action === 'request') {
    const requester = PEOPLE[NEXT_REQUESTERS[state.extra % NEXT_REQUESTERS.length]];
    state.extra += 1;
    state.seq += 1;
    const key = `${DEMO_PROJECT}-${state.seq}`;
    state.issues.push({
      key, project: DEMO_PROJECT, assignee: nadia, reporter: requester, due: ymd(state.today + 2),
      created: new Date(noon(state.today)).toISOString(), comments: [], updatedDay: state.today,
    });
    const r = await onRequest(storeOf(state), notesOf(state), key, noon(state.today), { event: 'created', allyBudgetMs: 5_000 });
    if (r.action === 'incubate') {
      const ally = r.record.suggested_ally ? ` It proposes ${r.record.suggested_ally.name} as an ally.` : '';
      say(state, `${requester.name} sends Nadia a request due in two days (${key}). That makes Nadia cornered: Ngogo holds it in incubation.${ally}`);
    } else {
      say(state, `${requester.name} sends Nadia a request due in two days (${key}). Nadia is not cornered: it goes straight through.`);
    }
  } else if (action === 'ally') {
    const target = state.issues.find((i) => i.assignee.id === nadia.id && i.reporter.id !== nadia.id && i.reporter.id !== PEOPLE.Omar.id);
    target.comments.push({ author: PEOPLE.Omar, created: new Date(noon(state.today)).toISOString() });
    target.updatedDay = state.today;
    say(state, `Omar acts on ${target.key} alongside Nadia.`);
    await runSweep(state);
  } else if (action === 'days') {
    state.today += 2;
    say(state, 'Two days pass.');
    await runSweep(state);
  }
  return state;
}
