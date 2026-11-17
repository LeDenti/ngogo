// Ngogo project page, "the organism": everyone with open work in this project, most cornered first.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, { useProductContext, Heading, Text, Stack, DynamicTable, Spinner, SectionMessage } from '@forge/react';
import { invoke } from '@forge/bridge';
import { projectOrganism } from '../ngogo/views.js';
import { store } from './jira-bridge';
import { StateLozenge, Caveats, ratioText, plural } from './shared';

const App = () => {
  const [data, setData] = useState(null);
  const [engine, setEngine] = useState(null);
  const [error, setError] = useState(null);

  const context = useProductContext();
  const projectKey = context?.extension?.project?.key;

  useEffect(() => {
    invoke('selfTest').then(setEngine).catch(() => setEngine(null));
  }, []);
  useEffect(() => {
    if (!projectKey) return;
    projectOrganism(store, projectKey).then(setData).catch((e) => setError(String(e)));
  }, [projectKey]);

  if (error) return <SectionMessage appearance="error"><Text>Ngogo could not read this project: {error}</Text></SectionMessage>;
  if (!data) return <Spinner />;

  const P = data.params;
  const cornered = data.people.filter((p) => p.state === 'cornered').length;
  const wary = data.people.filter((p) => p.state === 'wary').length;

  return (
    <Stack space="space.300">
      <Heading as="h2">The organism</Heading>
      <Text>
        For each person with open work in {data.projectKey}: how many independent sources press on them, across every project
        you can see, against how many people act alongside them. Counted to protect people, never to rank them.
      </Text>

      {data.people.length === 0 ? (
        <Text>Nobody has an open request assigned in this project.</Text>
      ) : (
        <SectionMessage appearance={cornered > 0 ? 'warning' : wary > 0 ? 'information' : 'success'}>
          <Text>
            {plural(cornered, 'person is', 'people are')} cornered, {plural(wary, 'person is', 'people are')} wary,
            out of {data.people.length}.
          </Text>
        </SectionMessage>
      )}

      <DynamicTable
        head={{
          cells: [
            { key: 'p', content: 'Person' }, { key: 'st', content: 'Balance of power' }, { key: 's', content: 'Sources' },
            { key: 'a', content: 'Allies' }, { key: 'n', content: 'Open requests' }, { key: 'top', content: 'Main sources' },
            { key: 'next', content: 'With one more ally' },
          ],
        }}
        rows={data.people.map((p) => ({
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

      <Text>
        Ratio = urgency-weighted sources / (1 + allies). An ally is someone other than the requester who acted on these requests
        in the last {P.window_days} days. Wary from {ratioText(P.wary_centi)} : 1, cornered from {ratioText(P.cornered_centi)} : 1.
        The eight-to-one line is a prudential default and a setting, not a published measurement.
      </Text>
      <Caveats truncated={data.truncated} />
      {engine ? (
        <Text>
          Decision engine check: {engine.steps} oracle steps replayed inside Forge, {engine.mismatchCount} mismatch.
        </Text>
      ) : null}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
