// Front end of the Ngogo issue panel (first trial build), written with UI Kit components only.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Heading, Text, Lozenge, Stack, DynamicTable, Spinner, SectionMessage } from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const [test, setTest] = useState(null);
  const [story, setStory] = useState(null);

  useEffect(() => {
    invoke('selfTest').then(setTest);
    invoke('story').then(setStory);
  }, []);

  return (
    <Stack space="space.200">
      <Heading as="h3">Ngogo engine check</Heading>
      {!test ? <Spinner /> : (
        <SectionMessage appearance={test.mismatchCount === 0 ? 'success' : 'error'}>
          <Text>
            {test.scenarios} scenarios, {test.steps} steps, {test.families} refusal families replayed inside Forge in {test.ms} ms: {test.mismatchCount} mismatch.
          </Text>
          {test.mismatches.map((m) => <Text key={m}>{m}</Text>)}
        </SectionMessage>
      )}
      <Heading as="h4">Field log</Heading>
      {!story ? <Spinner /> : (
        <DynamicTable
          head={{ cells: [{ key: 't', content: 'Day' }, { key: 's', content: 'What happened' }, { key: 'd', content: 'Decision' }, { key: 'm', content: 'Mood' }] }}
          rows={story.map((r, i) => ({
            key: String(i),
            cells: [
              { key: 't', content: String(r.t) },
              { key: 's', content: r.said },
              { key: 'd', content: r.decision },
              { key: 'm', content: <Lozenge appearance={r.mood === 'calm' ? 'success' : r.mood === 'wary' ? 'moved' : 'removed'}>{`${r.mood} ${(r.stress / 100).toFixed(1)} %`}</Lozenge> },
            ],
          }))}
        />
      )}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
