import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoInitial, demoStep, demoView, DEMO_PROJECT } from '../src/ngogo/demo.js';

const NOW = Date.parse('2026-11-17T09:00:00Z');
const row = (v, name) => v.people.find((p) => p.name === name);
const brief = (p) => [p.state, p.ratio_centi, p.source_count, p.ally_count];

test('the team this morning: twelve people, sixty requests, nobody cornered yet', async () => {
  const s = demoInitial(NOW);
  const v = await demoView(s);
  assert.equal(v.requests, 60);
  assert.equal(v.people.length, 12);
  assert.deepEqual(brief(row(v, 'Nadia')), ['wary', 770, 9, 0]);
  assert.deepEqual(brief(row(v, 'Lea')), ['wary', 430, 5, 0]);
  // Ines has more sources than Lea, and is calm, because two people act alongside her.
  assert.deepEqual(brief(row(v, 'Ines')), ['calm', 203, 7, 2]);
  assert.deepEqual(brief(row(v, 'Omar')), ['calm', 60, 1, 0]);
  const count = (st) => v.people.filter((p) => p.state === st).length;
  assert.deepEqual([count('cornered'), count('wary'), count('calm')], [0, 4, 8]);
  assert.equal(v.people[0].name, 'Nadia');
  assert.equal(v.held.length, 0);
  assert.equal(v.truncated, false);
});

test('the request too many is held, Omar is proposed; Omar steps in and it is released', async () => {
  const s = demoInitial(NOW);
  await demoStep(s, 'request');
  let v = await demoView(s);
  assert.deepEqual(brief(row(v, 'Nadia')), ['cornered', 870, 10, 0]);
  assert.equal(v.held.length, 1);
  assert.equal(v.held[0].key, `${DEMO_PROJECT}-61`);
  assert.match(v.held[0].lines[1], /Nadia is already pressed by 10 independent sources with 0 people acting alongside: 8\.70 to 1/);
  assert.match(v.held[0].lines[2], /Omar has the lightest load/);
  assert.match(v.log.at(-1).text, /Ines sends Nadia a request.*holds it in incubation\. It proposes Omar as an ally\./);

  await demoStep(s, 'ally');
  v = await demoView(s);
  assert.deepEqual(brief(row(v, 'Nadia')), ['wary', 435, 10, 1]);
  assert.equal(v.held.length, 0);
  assert.match(v.log.at(-1).text, /Ngogo releases TEAM-61: Nadia is no longer cornered\./);

  // With an ally alongside, the next request goes straight through.
  await demoStep(s, 'request');
  v = await demoView(s);
  assert.equal(v.held.length, 0);
  assert.match(v.log.at(-1).text, /Omar sends Nadia a request.*goes straight through\./);
});

test('held with nobody stepping in: released when the holding time is over', async () => {
  const s = demoInitial(NOW);
  await demoStep(s, 'request');
  await demoStep(s, 'days');
  const v = await demoView(s);
  assert.equal(v.held.length, 0);
  assert.equal(v.day, 2);
  assert.match(v.log.at(-1).text, /Ngogo releases TEAM-61: the holding time is over\./);
  // Nobody helped: Nadia is still cornered. The membrane buys time, it does not replace help.
  assert.equal(row(v, 'Nadia').state, 'cornered');
});

test('the story is the same whatever the day it is told', async () => {
  const run = async (now) => {
    const s = demoInitial(now);
    for (const a of ['request', 'ally', 'days', 'request']) await demoStep(s, a);
    const v = await demoView(s);
    return { people: v.people.map((p) => [p.name, ...brief(p)]), log: v.log.map((l) => [l.day, l.text]) };
  };
  assert.deepEqual(await run(NOW), await run(Date.parse('2027-02-03T23:30:00Z')));
});
