// The pool of a project: money, mood, advances, and the journal as a field log.
import React, { useEffect, useState } from 'react';
import { Heading, Text, Stack, Inline, Spinner, SectionMessage, Button, Textfield, Label, Box, DynamicTable } from '@forge/react';
import { invoke } from '@forge/bridge';
import { PoolSummary, AdvancesTable, FieldLog, NotABank, wholeOf } from './pool-parts';

export const PoolOfProject = () => {
  const [data, setData] = useState(null);
  const [amount, setAmount] = useState('20000');
  const [said, setSaid] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { invoke('poolView').then(setData).catch((e) => setData({ ok: false, error: String(e) })); }, []);

  const send = async (op, input) => {
    setBusy(true);
    try {
      const r = await invoke('poolAct', { op, input });
      if (!r.ok) { setSaid({ bad: true, text: r.error }); return; }
      setData({ ok: true, pool: r.pool });
      setSaid(r.accepted ? { bad: false, text: 'Done.' } : { bad: true, text: `Refused: ${r.why}.` });
    } catch (e) {
      setSaid({ bad: true, text: String(e) });
    } finally {
      setBusy(false);
    }
  };
  const fund = () => {
    const n = wholeOf(amount);
    if (!n) { setSaid({ bad: true, text: 'Give a whole amount above zero.' }); return; }
    send('deposit', { amount: n });
  };

  if (!data) return <Spinner />;
  if (!data.ok) return <SectionMessage appearance="error"><Text>{data.error}</Text></SectionMessage>;
  const pool = data.pool;

  return (
    <Stack space="space.300">
      <Text>
        The money side of the symbiosis. A supplier cornered by clients who pay late asks this shared pool for an advance on an invoice.
        The pool says yes or no with a reason, gets wary after a write-off, and calms down when advances are repaid.
      </Text>
      <PoolSummary pool={pool} />
      {said ? <SectionMessage appearance={said.bad ? 'warning' : 'success'}><Text>{said.text}</Text></SectionMessage> : null}

      <Inline space="space.100" alignBlock="end">
        <Stack><Label labelFor="ngogo-fund">Put into the pool</Label><Textfield id="ngogo-fund" defaultValue="20000" onChange={(e) => setAmount(e.target.value)} /></Stack>
        <Button appearance="primary" onClick={fund} isDisabled={busy}>Fund the pool</Button>
        <Button appearance="subtle" onClick={() => send('withdraw', {})} isDisabled={busy}>Take everything out</Button>
      </Inline>

      <AdvancesTable advances={pool.advances} />

      {pool.exposures.length > 0 ? (
        <DynamicTable
          caption="What each debtor owes the pool"
          head={{ cells: [{ key: 'd', content: 'Debtor' }, { key: 'o', content: 'Owes' }] }}
          rows={pool.exposures.map((e) => ({ key: e.debtor, cells: [{ key: 'd', content: e.debtor }, { key: 'o', content: String(e.owed) }] }))}
        />
      ) : null}

      {pool.log.length > 0 ? (
        <Box>
          <Heading as="h3">Field log, day {pool.day}</Heading>
          <FieldLog log={pool.log} />
        </Box>
      ) : null}
      <NotABank />
    </Stack>
  );
};
