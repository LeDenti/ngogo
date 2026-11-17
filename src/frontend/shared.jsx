// Pieces shared by the issue panel and the project page. UI Kit components only.
import React from 'react';
import { Lozenge, Text, DynamicTable, SectionMessage } from '@forge/react';

export const ratioText = (centi) => `${Math.floor(centi / 100)}.${String(centi % 100).padStart(2, '0')}`;

const APPEARANCE = { calm: 'success', wary: 'moved', cornered: 'removed' };

/** "cornered 9.00 : 1" as a coloured lozenge. */
export const StateLozenge = ({ state, ratio_centi }) => (
  <Lozenge appearance={APPEARANCE[state]} isBold={state === 'cornered'}>
    {`${state} ${ratioText(ratio_centi)} : 1`}
  </Lozenge>
);

export const dueText = (days) => {
  if (days === null || days === undefined) return 'no due date';
  if (days < 0) return `overdue by ${-days} d`;
  if (days === 0) return 'due today';
  return `due in ${days} d`;
};

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Honest footnote: what the numbers could not see. */
export const Caveats = ({ truncated }) =>
  truncated ? <Text>Jira had more open requests than Ngogo read: the real pressure is at least this high.</Text> : null;

/** The organism: everyone, most cornered first. Used by the live page and by the demo. */
export const PeopleTable = ({ people }) => (
  <DynamicTable
    head={{
      cells: [
        { key: 'p', content: 'Person' }, { key: 'st', content: 'Balance of power' }, { key: 's', content: 'Sources' },
        { key: 'a', content: 'Allies' }, { key: 'n', content: 'Open requests' }, { key: 'top', content: 'Main sources' },
        { key: 'next', content: 'With one more ally' },
      ],
    }}
    rows={people.map((p) => ({
      key: p.id,
      cells: [
        { key: 'p', content: p.name },
        { key: 'st', content: <StateLozenge state={p.state} ratio_centi={p.ratio_centi} /> },
        { key: 's', content: String(p.source_count) },
        { key: 'a', content: p.ally_count > 0 ? p.allies.map((a) => a.name).join(', ') : 'none' },
        { key: 'n', content: String(p.open_requests) },
        { key: 'top', content: p.sources.slice(0, 3).map((s) => `${s.label} (${s.requests})`).join(', ') || 'none' },
        { key: 'next', content: `${ratioText(p.ratio_with_one_more_ally_centi)} : 1` },
      ],
    }))}
  />
);

/** One line that sums the organism up. */
export const Headline = ({ people }) => {
  const cornered = people.filter((p) => p.state === 'cornered').length;
  const wary = people.filter((p) => p.state === 'wary').length;
  return (
    <SectionMessage appearance={cornered > 0 ? 'warning' : wary > 0 ? 'information' : 'success'}>
      <Text>
        {plural(cornered, 'person is', 'people are')} cornered, {plural(wary, 'person is', 'people are')} wary, out of {people.length}.
      </Text>
    </SectionMessage>
  );
};

export const Rule = ({ params }) => (
  <Text>
    Ratio = urgency-weighted sources / (1 + allies). An ally is someone other than the requester who acted on these requests
    in the last {params.window_days} days. Wary from {ratioText(params.wary_centi)} : 1, cornered from {ratioText(params.cornered_centi)} : 1.
    The eight-to-one line is a prudential default and a setting, not a published measurement.
  </Text>
);
