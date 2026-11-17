// Pieces of the pool screens. UI Kit components only.
import React from 'react';
import { Lozenge, Text, Strong, Stack, Inline, DynamicTable, SectionMessage, List, ListItem } from '@forge/react';

const MOOD = { calm: 'success', wary: 'moved', feral: 'removed' };
export const MoodLozenge = ({ mood, stress }) => <Lozenge appearance={MOOD[mood] ?? 'default'}>{`${mood} ${stress ?? ''}`.trim()}</Lozenge>;

const STATUS = { funded: 'inprogress', repaid: 'success', defaulted: 'removed', bought_back: 'success' };
export const StatusLozenge = ({ status }) => <Lozenge appearance={STATUS[status] ?? 'default'}>{status.replace('_', ' ')}</Lozenge>;

export const NotABank = () => (
  <Text>A book, not a bank: play numbers, no custody, no money moves. Decisions come from the Ferret engine: twelve ordered checks and a mood.</Text>
);

/** The pool in one block: money, mood, and the ceilings the mood currently allows. */
export const PoolSummary = ({ pool }) => (
  <Stack space="space.100">
    <Inline space="space.200" alignBlock="center">
      <Text><Strong>{pool.capital}</Strong> in the pool, <Strong>{pool.free_cash}</Strong> free</Text>
      <MoodLozenge mood={pool.mood} stress={pool.stress} />
    </Inline>
    {pool.outstanding !== undefined ? (
      <Text>{pool.outstanding} advanced and not yet repaid, {pool.fees_earned} earned in fees, {pool.losses} lost to write-offs.</Text>
    ) : null}
    <Text>
      Ceilings now: one debtor may owe at most {pool.ceilings.debtor_share} of the pool (calm: {pool.ceilings.calm_debtor_share}),
      an invoice may be due in at most {pool.ceilings.longest_term_days} days (calm: {pool.ceilings.calm_longest_term_days}),
      and an advance is at most {pool.ceilings.advance_share_of_invoice} of the invoice.
    </Text>
  </Stack>
);

/** The pool's last word on one invoice. Used in the issue panel and in the customer portal. */
export const Answer = ({ invoice }) => {
  const a = invoice?.advance;
  const last = invoice?.last_answer;
  if (a) {
    return (
      <SectionMessage appearance={a.status === 'defaulted' ? 'error' : a.status === 'funded' ? 'information' : 'success'} title={`Advance of ${a.advance} on this invoice`}>
        <Inline space="space.100" alignBlock="center"><StatusLozenge status={a.status} /><Text>invoice of {a.face} owed by {a.debtor}, fee {a.fee}</Text></Inline>
        {a.status === 'funded' ? (
          <Text>{a.still_owed} still owed to the pool. {a.due_in_days >= 0 ? `Due in ${a.due_in_days} days.` : `Overdue by ${-a.due_in_days} days.`}</Text>
        ) : null}
      </SectionMessage>
    );
  }
  if (last && !last.accepted) {
    return (
      <SectionMessage appearance="warning" title={`The pool refused an advance of ${last.asked}`}>
        <Text>Reason: {last.why}. Nothing is final: a smaller advance, a nearer due date or a calmer pool can change the answer.</Text>
      </SectionMessage>
    );
  }
  return null;
};

export const AdvancesTable = ({ advances }) => (
  <DynamicTable
    caption="Advances"
    head={{ cells: ['Invoice', 'Debtor', 'Invoice amount', 'Advance', 'Still owed', 'Status', 'Due'].map((c) => ({ key: c, content: c })) }}
    rows={advances.map((a) => ({
      key: a.invoice,
      cells: [
        { key: 'i', content: a.invoice }, { key: 'd', content: a.debtor }, { key: 'f', content: String(a.face) },
        { key: 'a', content: String(a.advance) }, { key: 'o', content: String(a.still_owed) }, { key: 'st', content: <StatusLozenge status={a.status} /> },
        { key: 'due', content: a.status !== 'funded' ? 'closed' : a.due_in_days >= 0 ? `in ${a.due_in_days} d` : `overdue ${-a.due_in_days} d` },
      ],
    }))}
    emptyView={<Text>No advance yet. An advance is asked from the Ngogo panel of a request.</Text>}
  />
);

export const FieldLog = ({ log }) => (
  <List type="ordered">
    {log.slice(-12).map((l, i) => <ListItem key={String(i)}><Text><Strong>Day {l.day}.</Strong> {l.text}</Text></ListItem>)}
  </List>
);

/** "1200" -> 1200, anything else -> null. Whole numbers only: the engine does integer arithmetic. */
export const wholeOf = (text) => (/^\d{1,10}$/.test(String(text ?? '').trim()) ? Number(String(text).trim()) : null);
