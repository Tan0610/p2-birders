import type { ConnectionInfo, SwarmIdClient } from '@snaha/swarm-id';
import { useEffect, useState } from 'react';
import { currentConnectionInfo, initSwarmId, onConnectionChange } from '../swarm/client';

export type SwarmIdState =
  | { status: 'loading' }
  | { status: 'failed'; detail: string }
  | { status: 'ready'; client: SwarmIdClient; info: ConnectionInfo | null };

export function useSwarmId(): SwarmIdState {
  const [state, setState] = useState<SwarmIdState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    const unsubscribe = onConnectionChange((info) => {
      setState((prev) => (prev.status === 'ready' ? { ...prev, info } : prev));
    });
    initSwarmId()
      .then((client) => alive && setState({ status: 'ready', client, info: currentConnectionInfo() }))
      .catch((err: unknown) => alive && setState({ status: 'failed', detail: err instanceof Error ? err.message : String(err) }));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return state;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
