// Ngogo issue panel: the balance of power around the person this request lands on.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, { useProductContext, Heading, Text, Strong, Stack, Inline, DynamicTable, Spinner, SectionMessage, Button, Tabs, TabList, Tab, TabPanel, Box } from '@forge/react';
import { issueEncirclement } from '../ngogo/views.js';
import { store, notes } from './jira-bridge';
import { releasedRecord, releaseComment, incubationLines } from '../ngogo/membrane.js';
import { PoolOnRequest } from './pool-issue';
import { StateLozenge, Caveats, ratioText, dueText, plural } from './shared';

const Balance = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [held, setHeld] = useState(null);
  const [releasing, setReleasing] = useState(false);

  const context = useProductContext();
  const issueKey = context?.extension?.issue?.key;

  useEffect(() => {
    if (!issueKey) return;
    issueEncirclement(store, issueKey).then(setData).catch((e) => setError(String(e)));
    // The membrane's record on this request, if it was ever held. Failing to read it must not hide the index.
    notes.read(issueKey).then(setHeld).catch(() => setHeld(null));
  }, [issueKey]);

  // Releasing is done with the viewer's own Jira rights: whoever can edit the request can release it.
  const release = async () => {
    setReleasing(true);
    try {
      const released = releasedRecord(held, 'released_by_hand', Date.now(), context?.accountId ?? null);
      await notes.write(issueKey, released);
      await notes.comment(issueKey, releaseComment(released));
      setHeld(released);
    } catch (e) {
      setError(`could not release it (${String(e)})`);
    } finally {
      setReleasing(false);
    }
  };

  const Membrane = () => {
    if (!held) return null;
    if (held.state === 'incubating') {
      const lines = incubationLines(held);
      return (
        <SectionMessage appearance="warning" title="Held in incubation">
          {lines.slice(0, 3).map((l) => <Text key={l}>{l}</Text>)}
          <Button appearance="primary" onClick={release} isDisabled={releasing}>
            {releasing ? 'Releasing…' : 'Release now'}
          </Button>
        </SectionMessage>
      );
    }
    return <Text>Ngogo held this request from {held.since.slice(0, 10)} and released it on {held.released_at.slice(0, 10)}.</Text>;
  };

  if (error) return <SectionMessage appearance="error"><Text>Ngogo could not read this request: {error}</Text></SectionMessage>;
  if (!data) return <Spinner />;
  if (data.status === 'unassigned') return <Text>Nobody is assigned to this request, so it corners nobody yet.</Text>;
  if (data.status !== 'ok') return <Text>Ngogo could not find this request.</Text>;

  const p = data.person;
  const days = data.params.window_days;
  const src = data.thisRequest.source;

  return (
    <Stack space="space.200">
      <Membrane />
      <Inline space="space.100" alignBlock="center">
        <Heading as="h3">{p.name}</Heading>
        <StateLozenge state={p.state} ratio_centi={p.ratio_centi} />
      </Inline>

      <Text>
        {plural(p.source_count, 'independent source', 'independent sources')} of pressure, {plural(p.ally_count, 'ally', 'allies')} in
        the last {days} days, {plural(p.open_requests, 'open request', 'open requests')}.
      </Text>

      {data.thisRequest.selfRaised ? (
        <Text>{p.name} raised this request personally: it adds no outside pressure.</Text>
      ) : src ? (
        <Text>
          This request comes from <Strong>{src.label}</Strong>, behind {plural(src.requests, 'open request', 'open requests')} on {p.name}.
        </Text>
      ) : null}

      {p.state !== 'calm' ? (
        <SectionMessage appearance={p.state === 'cornered' ? 'warning' : 'information'} title="What would change this">
          <Text>
            One more person acting on these requests alongside {p.name} brings the ratio
            to {ratioText(p.ratio_with_one_more_ally_centi)} : 1 ({p.state_with_one_more_ally}).
          </Text>
        </SectionMessage>
      ) : null}

      <DynamicTable
        caption="Sources of pressure"
        rowsPerPage={8}
        head={{ cells: [{ key: 's', content: 'Source' }, { key: 'n', content: 'Open requests' }, { key: 'd', content: 'Most urgent' }, { key: 'w', content: 'Weight' }] }}
        rows={p.sources.map((s) => ({
          key: s.key,
          cells: [
            { key: 's', content: s.label },
            { key: 'n', content: String(s.requests) },
            { key: 'd', content: dueText(s.nearest_due_days) },
            { key: 'w', content: ratioText(s.weight_bps / 100) },
          ],
        }))}
        emptyView={<Text>No outside source of pressure.</Text>}
      />

      {p.ally_count > 0 ? (
        <Text>Acting alongside {p.name}: {p.allies.map((a) => `${a.name} (${a.actions})`).join(', ')}.</Text>
      ) : (
        <Text>Nobody has acted on these requests alongside {p.name} in the last {days} days.</Text>
      )}

      <Caveats truncated={data.truncated} />
    </Stack>
  );
};

const App = () => (
  <Tabs id="ngogo-panel-tabs">
    <TabList>
      <Tab>Balance of power</Tab>
      <Tab>Pool</Tab>
    </TabList>
    <TabPanel><Box paddingBlockStart="space.200"><Balance /></Box></TabPanel>
    <TabPanel><Box paddingBlockStart="space.200"><PoolOnRequest /></Box></TabPanel>
  </Tabs>
);

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
