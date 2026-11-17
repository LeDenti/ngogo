// Ngogo project page, "the organism".
//   This project : everyone with open work in the project, most cornered first, from live Jira.
//   Demo team    : a simulated team of twelve to try the index and the membrane on a site with no data.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  useProductContext, Heading, Text, Strong, Stack, Spinner, SectionMessage,
  Tabs, TabList, Tab, TabPanel, Button, ButtonGroup, List, ListItem, Box,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { projectOrganism } from '../ngogo/views.js';
import { demoInitial, demoStep, demoView } from '../ngogo/demo.js';
import { store } from './jira-bridge';
import { Caveats, PeopleTable, Headline, Rule } from './shared';
import { PoolOfProject } from './pool-project';

const Live = ({ projectKey }) => {
  const [data, setData] = useState(null);
  const [engine, setEngine] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    invoke('selfTest').then(setEngine).catch(() => setEngine(null));
  }, []);
  useEffect(() => {
    if (!projectKey) return;
    projectOrganism(store, projectKey).then(setData).catch((e) => setError(String(e)));
  }, [projectKey]);

  if (error) return <SectionMessage appearance="error"><Text>Ngogo could not read this project: {error}</Text></SectionMessage>;
  if (!data) return <Spinner />;

  return (
    <Stack space="space.300">
      <Text>
        For each person with open work in {data.projectKey}: how many independent sources press on them, across every project
        you can see, against how many people act alongside them. Counted to protect people, never to rank them.
      </Text>
      {data.people.length === 0 ? (
        <SectionMessage appearance="information">
          <Text>Nobody has an open request assigned in this project yet. The Demo team tab shows Ngogo at work on a simulated team.</Text>
        </SectionMessage>
      ) : (
        <>
          <Headline people={data.people} />
          <PeopleTable people={data.people} />
        </>
      )}
      <Rule params={data.params} />
      <Caveats truncated={data.truncated} />
      {engine ? <Text>Decision engine check: {engine.steps} oracle steps replayed inside Forge, {engine.mismatchCount} mismatch.</Text> : null}
    </Stack>
  );
};

const Demo = () => {
  const [state, setState] = useState(null);
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    const s = demoInitial(Date.now());
    setState(s);
    setView(await demoView(s));
  };
  useEffect(() => { reset(); }, []);

  const act = (action) => async () => {
    setBusy(true);
    try {
      await demoStep(state, action);
      setView(await demoView(state));
    } finally {
      setBusy(false);
    }
  };

  if (!view) return <Spinner />;

  return (
    <Stack space="space.300">
      <SectionMessage appearance="discovery" title="A simulated team">
        <Text>
          Twelve invented people and {view.requests} invented requests. Nothing is read from or written to your Jira here.
          The numbers come from the same code that runs on your live project in the other tab.
        </Text>
      </SectionMessage>

      <ButtonGroup label="Story steps">
        <Button appearance="primary" onClick={act('request')} isDisabled={busy}>One more request for Nadia</Button>
        <Button onClick={act('ally')} isDisabled={busy}>Omar steps in</Button>
        <Button onClick={act('days')} isDisabled={busy}>Two days pass</Button>
        <Button appearance="subtle" onClick={reset} isDisabled={busy}>Start again</Button>
      </ButtonGroup>

      <Headline people={view.people} />

      {view.held.map((h) => (
        <SectionMessage key={h.key} appearance="warning" title={`${h.key} is held in incubation`}>
          {h.lines.slice(0, 3).map((l) => <Text key={l}>{l}</Text>)}
        </SectionMessage>
      ))}

      <PeopleTable people={view.people} />

      <Box>
        <Heading as="h3">Field log, day {view.day}</Heading>
        <List type="ordered">
          {view.log.map((l, i) => <ListItem key={String(i)}><Text><Strong>Day {l.day}.</Strong> {l.text}</Text></ListItem>)}
        </List>
      </Box>

      <Rule params={view.params} />
    </Stack>
  );
};

const App = () => {
  const context = useProductContext();
  const projectKey = context?.extension?.project?.key;
  return (
    <Stack space="space.200">
      <Heading as="h2">The organism</Heading>
      <Tabs id="ngogo-organism-tabs">
        <TabList>
          <Tab>This project</Tab>
          <Tab>Demo team</Tab>
          <Tab>Pool</Tab>
        </TabList>
        <TabPanel><Box paddingBlockStart="space.200"><Live projectKey={projectKey} /></Box></TabPanel>
        <TabPanel><Box paddingBlockStart="space.200"><Demo /></Box></TabPanel>
        <TabPanel><Box paddingBlockStart="space.200"><PoolOfProject /></Box></TabPanel>
      </Tabs>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
