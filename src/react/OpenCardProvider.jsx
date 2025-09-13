import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { OpenCardContext } from './OpenCardContext.jsx';
import { OpenCardClient } from '../core/OpenCardClient.js';

// Try to load OpenAI at module level
let OpenAI = null;
try {
  OpenAI = require('openai');
} catch (e) {
  // OpenAI not installed - will handle this gracefully
}

export function OpenCardProvider({ children, config, openaiClient }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [user, setUser] = useState(null);
  const [client, setClient] = useState(openaiClient || null);

  const opencardClient = useMemo(() => new OpenCardClient(config), [config]);

  const createOpenAIClient = useCallback(async () => {
    // If user provided a client explicitly, use that
    if (openaiClient) {
      setClient(openaiClient);
      return;
    }

    // If OpenAI is not available, show clear error
    if (!OpenAI) {
      throw new Error(
        'The @opencard/sdk package requires \'openai\' as a peer dependency. ' +
        'Please run `npm install openai` in your project, or pass an openaiClient prop to OpenCardProvider.'
      );
    }

    // Create OpenAI client with OpenCard configuration
    const newClient = await opencardClient.createOpenAIClient(OpenAI);
    setClient(newClient);
  }, [opencardClient, openaiClient]);

  const signIn = useCallback(async () => {
    try {
      setIsAuthenticating(true);
      // TODO: Implement authentication logic
      const session = await opencardClient.authenticate();
      
      setIsAuthenticated(true);
      setUser(opencardClient.getUser());
      
      // After successful authentication, create OpenAI client
      await createOpenAIClient();
    } catch (error) {
      console.error('Failed to authenticate:', error);
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  }, [opencardClient, createOpenAIClient]);

  const signOut = useCallback(async () => {
    try {
      await opencardClient.signOut();
      setIsAuthenticated(false);
      setUser(null);
      setClient(openaiClient || null); // Reset to provided client or null
    } catch (error) {
      console.error('Failed to sign out:', error);
      throw error;
    }
  }, [opencardClient, openaiClient]);

  useEffect(() => {
    // Load session from storage and handle OAuth callback
    const initializeAuth = async () => {
      // First, load any existing session from storage
      opencardClient.loadSessionFromStorage();
      
      // Then check if this is an OAuth callback
      try {
        const callbackResult = await opencardClient.handleRedirectCallback();
        if (callbackResult) {
          // We just completed authentication
          setIsAuthenticated(true);
          setUser(opencardClient.getUser());
          
          // Set up OpenAI client if available
          if (openaiClient || OpenAI) {
            await createOpenAIClient();
          }
          return;
        }
      } catch (error) {
        console.error('OAuth callback error:', error);
      }
      
      // Check for existing session
      const existingSession = opencardClient.getSession();
      if (existingSession) {
        setIsAuthenticated(true);
        setUser(opencardClient.getUser());
        // If user provided a client or we have OpenAI available, set it up
        if (openaiClient || OpenAI) {
          createOpenAIClient().catch(console.error);
        }
      }
    };

    initializeAuth();
  }, [opencardClient, createOpenAIClient, openaiClient]);

  const value = useMemo(
    () => ({
      client,
      isAuthenticated,
      isAuthenticating,
      user,
      signIn,
      signOut,
    }),
    [client, isAuthenticated, isAuthenticating, user, signIn, signOut]
  );

  return <OpenCardContext.Provider value={value}>{children}</OpenCardContext.Provider>;
}