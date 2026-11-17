// Pieces shared by the issue panel and the project page. UI Kit components only.
import React from 'react';
import { Lozenge, Text } from '@forge/react';

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
