import { useState, useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { OpenCardContext } from './OpenCardContext';
import { OpenCardClient } from '../core/OpenCardClient';
import type { OpenCardConfig, Profile, Session, ModelCallOptions, ModelResponse } from '../types';

export interface OpenCardProviderProps {
  children: ReactNode;
  config?: OpenCardConfig;
}

export function OpenCardProvider({ children, config }: OpenCardProviderProps) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [profile, setProfile] = useState<Profile | undefined>();
  const [session, setSession] = useState<Session | undefined>();

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

  const callModel = useCallback(async (options: ModelCallOptions): Promise<ModelResponse> => {
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