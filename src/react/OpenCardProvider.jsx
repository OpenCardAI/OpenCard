import { useState, useCallback, useEffect, useMemo } from 'react';
import { OpenCardContext } from './OpenCardContext.jsx';
import { OpenCardClient } from '../core/OpenCardClient.js';

export function OpenCardProvider({ children, config }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [profile, setProfile] = useState();
  const [session, setSession] = useState();

  const client = useMemo(() => new OpenCardClient(config), [config]);

  const connect = useCallback(async () => {
    try {
      setConnecting(true);
      // TODO: Implement connection logic
      const newSession = await client.connect();
      setSession(newSession);
      setConnected(true);
      if (newSession.profile) {
        setProfile(newSession.profile);
      }
    } catch (error) {
      console.error('Failed to connect:', error);
      throw error;
    } finally {
      setConnecting(false);
    }
  }, [client]);

  const disconnect = useCallback(async () => {
    try {
      await client.disconnect();
      setConnected(false);
      setProfile(undefined);
      setSession(undefined);
    } catch (error) {
      console.error('Failed to disconnect:', error);
      throw error;
    }
  }, [client]);

  const callModel = useCallback(async (options) => {
    if (!connected) {
      throw new Error('Not connected to OpenCard');
    }
    return client.callModel(options);
  }, [client, connected]);

  useEffect(() => {
    // TODO: Check for existing session on mount
    const existingSession = client.getSession();
    if (existingSession) {
      setSession(existingSession);
      setConnected(true);
      if (existingSession.profile) {
        setProfile(existingSession.profile);
      }
    }
  }, [client]);

  const value = useMemo(
    () => ({
      connected,
      connecting,
      profile,
      session,
      connect,
      disconnect,
      callModel,
    }),
    [connected, connecting, profile, session, connect, disconnect, callModel]
  );

  return <OpenCardContext.Provider value={value}>{children}</OpenCardContext.Provider>;
}