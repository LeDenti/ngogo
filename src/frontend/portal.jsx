// Customer portal: the pool's answer on the customer's own request. Nothing else about the pool is shown.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Text, Stack, Spinner } from '@forge/react';
import { invoke } from '@forge/bridge';
import { Answer } from './pool-parts';

const App = () => {
  const [data, setData] = useState(null);
  useEffect(() => { invoke('poolRequest').then(setData).catch(() => setData({ ok: false })); }, []);
  if (!data) return <Spinner />;
  if (!data.ok || (!data.invoice.advance && !data.invoice.last_answer)) return <Text>No advance was asked on this request.</Text>;
  return (
    <Stack space="space.100">
      <Answer invoice={data.invoice} />
      <Text>Decided by rule, with the reason given. Play numbers: no money moves.</Text>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
