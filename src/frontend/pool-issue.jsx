// The pool, seen from one request: ask an advance on this invoice, then repay, write off or buy back.
import React, { useEffect, useState } from 'react';
import { Text, Stack, Inline, Spinner, SectionMessage, Button, ButtonGroup, Textfield, Checkbox, Label } from '@forge/react';
import { invoke } from '@forge/bridge';
import { PoolSummary, Answer, NotABank, wholeOf } from './pool-parts';

export const PoolOnRequest = () => {
  const [data, setData] = useState(null);
  const [said, setSaid] = useState(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ debtor: '', face: '', advance: '', fee: '0', days: '30', analysis: false });
  // Uncontrolled fields: UI Kit renders remotely, and feeding `value` back on every keystroke loses characters.
  const set = (k) => (e) => { const v = e.target.value; setF((prev) => ({ ...prev, [k]: v })); };

  useEffect(() => { invoke('poolInvoice').then(setData).catch((e) => setData({ ok: false, error: String(e) })); }, []);

  const send = async (op, input) => {
    setBusy(true);
    try {
      const r = await invoke('poolAct', { op, input });
      if (!r.ok) { setSaid({ bad: true, text: r.error }); return; }
      setData({ ok: true, invoice: r.invoice, pool: r.pool });
      // A refused advance is already explained by the answer block above: do not say it twice.
      setSaid(r.accepted ? { bad: false, text: 'Accepted.' } : op === 'advance' ? null : { bad: true, text: `Refused: ${r.why}.` });
    } catch (e) {
      setSaid({ bad: true, text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const askAdvance = () => {
    const input = { debtor: f.debtor, face: wholeOf(f.face), advance: wholeOf(f.advance), fee: wholeOf(f.fee), days: wholeOf(f.days), analysis: f.analysis };
    // The grey examples in the fields are placeholders, not values: say what is missing rather than a rule.
    if (!String(f.debtor).trim()) { setSaid({ bad: true, text: 'Type who owes the invoice first, for example Acme.' }); return; }
    if ([input.face, input.advance, input.fee, input.days].some((v) => v === null)) { setSaid({ bad: true, text: 'Type the invoice amount and the advance asked, as whole numbers: for example 5000 and 4500.' }); return; }
    send('advance', input);
  };

  if (!data) return <Spinner />;
  if (!data.ok) return <SectionMessage appearance="error"><Text>{data.error}</Text></SectionMessage>;

  const a = data.invoice.advance;
  return (
    <Stack space="space.200">
      <PoolSummary pool={data.pool} />
      <Answer invoice={data.invoice} />
      {said ? <SectionMessage appearance={said.bad ? 'warning' : 'success'}><Text>{said.text}</Text></SectionMessage> : null}

      {a && a.status === 'funded' ? (
        <ButtonGroup label="This advance">
          <Button appearance="primary" onClick={() => send('repay', {})} isDisabled={busy}>The debtor paid: repay {a.still_owed}</Button>
          <Button onClick={() => send('default', {})} isDisabled={busy}>Write off as unpaid</Button>
        </ButtonGroup>
      ) : null}
      {a && a.status === 'defaulted' ? (
        <Button onClick={() => send('buyback', {})} isDisabled={busy}>The supplier buys it back</Button>
      ) : null}

      {!a ? (
        <Stack space="space.100">
          <Text>Treat this request as an invoice and ask the pool for an advance on it.</Text>
          <Label labelFor="ngogo-debtor">Who owes the invoice</Label>
          <Textfield id="ngogo-debtor" defaultValue="" onChange={set('debtor')} placeholder="Acme" />
          <Inline space="space.100">
            <Stack><Label labelFor="ngogo-face">Invoice amount</Label><Textfield id="ngogo-face" defaultValue="" onChange={set('face')} placeholder="5000" /></Stack>
            <Stack><Label labelFor="ngogo-advance">Advance asked</Label><Textfield id="ngogo-advance" defaultValue="" onChange={set('advance')} placeholder="4500" /></Stack>
            <Stack><Label labelFor="ngogo-fee">Fee</Label><Textfield id="ngogo-fee" defaultValue="0" onChange={set('fee')} /></Stack>
            <Stack><Label labelFor="ngogo-days">Due in (days)</Label><Textfield id="ngogo-days" defaultValue="30" onChange={set('days')} /></Stack>
          </Inline>
          <Checkbox label="I checked this invoice: it is real and it is owed" onChange={(e) => { const c = e.target.checked; setF((prev) => ({ ...prev, analysis: c })); }} />
          <Button appearance="primary" onClick={askAdvance} isDisabled={busy}>Ask the pool</Button>
        </Stack>
      ) : null}
      <NotABank />
    </Stack>
  );
};
