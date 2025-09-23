import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { OpenCardContext } from './OpenCardContext.jsx';
import { OpenCardClient } from '../core/OpenCardClient.js';

// Try to load OpenAI at module level
let OpenAI = null;
try {
  OpenAI = require('openai');
} catch (e) {
  // OpenAI not installed - will handle this gracefully
}

// Enhanced global state to prevent multiple provider instances from interfering
if (typeof window !== 'undefined') {
  window.__OPENCARD_PROVIDER_STATE = window.__OPENCARD_PROVIDER_STATE || {
    initialized: false,
    instanceCount: 0,
    lastInitTime: 0,
    activeProvider: null, // Track the single active provider
    pendingCleanups: new Set() // Track providers marked for cleanup
  };
}

export function OpenCardProvider({ children, config, openaiClient }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [user, setUser] = useState(null);
  const [client, setClient] = useState(openaiClient || null);

  // Enhanced React StrictMode and hot reload protection
  const initializeRef = useRef(false);
  const instanceIdRef = useRef(null);

  // Generate unique instance ID and implement strict singleton enforcement
  if (!instanceIdRef.current && typeof window !== 'undefined') {
    instanceIdRef.current = `provider-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const globalState = window.__OPENCARD_PROVIDER_STATE;

    // IMMEDIATE CLEANUP DETECTION: If there's already an active provider, mark this one for cleanup
    if (globalState.activeProvider && globalState.activeProvider !== instanceIdRef.current) {
      console.log(`[OpenCard] ${instanceIdRef.current}: Duplicate provider detected, marking previous for cleanup: ${globalState.activeProvider}`);
      globalState.pendingCleanups.add(globalState.activeProvider);
    }

    // Set this as the active provider
    globalState.activeProvider = instanceIdRef.current;
    globalState.instanceCount++;
    console.log(`[OpenCard] ${instanceIdRef.current}: New provider instance (total: ${globalState.instanceCount}, active: ${globalState.activeProvider})`);
  }

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

    try {
      // Ensure we have fresh tokens before creating client
      await opencardClient.ensureFresh();

      // Create OpenAI client with ephemeral key
      const newClient = opencardClient.createOpenAIClient(OpenAI);
      setClient(newClient);
    } catch (error) {
      // If ephemeral key is expired, clear authentication state
      if (error.message.includes('ephemeral key expired') || error.message.includes('Not authenticated')) {
        setIsAuthenticated(false);
        setUser(null);
        setClient(openaiClient || null);
      }
      throw error;
    }
  }, [opencardClient, openaiClient]);

  const signIn = useCallback(async () => {
    try {
      setIsAuthenticating(true);
      // Pass true to skip silent refresh and go directly to login redirect
      const session = await opencardClient.authenticate(true);

      // Only set authenticated if we got a real session with tokens
      // (from callback or silent refresh, not from redirect)
      if (session && session.accessToken) {
        setIsAuthenticated(true);
        setUser(opencardClient.getUser());

        // After successful authentication, create OpenAI client
        await createOpenAIClient();
        setIsAuthenticating(false);
      }
      // If no session returned, we're redirecting - keep isAuthenticating true
      // The useEffect will handle setting state when we return from auth
    } catch (error) {
      console.error('Failed to authenticate:', error);
      setIsAuthenticating(false);
      throw error;
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
    // Enhanced protection against React StrictMode and hot reloads
    if (initializeRef.current) {
      console.log(`[OpenCard] ${instanceIdRef.current}: Skipping re-initialization (already initialized)`);
      return;
    }

    // IMMEDIATE CLEANUP CHECK: If this provider is marked for cleanup, don't initialize
    if (typeof window !== 'undefined') {
      const globalState = window.__OPENCARD_PROVIDER_STATE;

      if (globalState.pendingCleanups.has(instanceIdRef.current)) {
        console.log(`[OpenCard] ${instanceIdRef.current}: Provider marked for cleanup, skipping initialization`);
        return;
      }

      // If this is not the active provider, skip initialization
      if (globalState.activeProvider !== instanceIdRef.current) {
        console.log(`[OpenCard] ${instanceIdRef.current}: Not the active provider (active: ${globalState.activeProvider}), skipping initialization`);
        return;
      }

      const now = Date.now();

      // If another instance initialized recently (within 1 second), skip
      if (globalState.initialized && (now - globalState.lastInitTime) < 1000) {
        console.log(`[OpenCard] ${instanceIdRef.current}: Skipping initialization (recent global init: ${now - globalState.lastInitTime}ms ago)`);
        return;
      }

      globalState.initialized = true;
      globalState.lastInitTime = now;
    }

    initializeRef.current = true;
    console.log(`[OpenCard] ${instanceIdRef.current}: Starting authentication initialization`);

    // Handle OAuth callback and attempt silent refresh
    const initializeAuth = async () => {
      // PERFORMANCE: Check if this is a callback BEFORE making any network requests
      // This avoids unnecessary refresh attempts that will fail
      const isCallback = (typeof window !== 'undefined') &&
        (window.location.hash?.includes('code=') ||
         window.location.search?.includes('code=') ||
         window.location.hash?.includes('error=') ||
         window.location.search?.includes('error='));

      if (isCallback) {
        // Handle OAuth callback
        try {
          const callbackResult = await opencardClient.handleRedirectCallback();
          if (callbackResult) {
            // We just completed authentication
            setIsAuthenticated(true);
            setUser(opencardClient.getUser());
            setIsAuthenticating(false); // Clear authenticating state

            // Set up OpenAI client if available
            if (openaiClient || OpenAI) {
              await createOpenAIClient();
            }
          }
        } catch (error) {
          console.error('OAuth callback error:', error);
          setIsAuthenticating(false); // Clear authenticating state on error
        }
        return; // Don't attempt silent refresh after callback
      }

      // Not a callback - use two-phase authentication check

      // PHASE 1: Instant check - update UI immediately based on current session
      const authStatus = opencardClient.checkAuthStatus();
      if (authStatus.isAuthenticated) {
        console.log(`[OpenCard] ${instanceIdRef.current}: Found valid session, updating UI immediately`);
        setIsAuthenticated(true);
        setUser(opencardClient.getUser());

        // Set up OpenAI client if available
        if (openaiClient || OpenAI) {
          try {
            await createOpenAIClient();
          } catch (error) {
            console.warn('Failed to create OpenAI client with existing session:', error);
          }
        }
      } else {
        // No valid session found
        setIsAuthenticated(false);
        setUser(null);
        setClient(openaiClient || null);
      }

      // PHASE 2: Background refresh - only if needed
      if (authStatus.needsRefresh) {
        console.log(`[OpenCard] ${instanceIdRef.current}: Session needs refresh, attempting in background...`);
        try {
          await opencardClient.ensureFresh();
          // If refresh succeeded, update state (in case it changed)
          setIsAuthenticated(true);
          setUser(opencardClient.getUser());

          // Recreate OpenAI client with fresh tokens
          if (openaiClient || OpenAI) {
            await createOpenAIClient();
          }
        } catch (error) {
          // Check if this is an authentication error or just a network issue
          console.log(`[OpenCard] ${instanceIdRef.current}: Background refresh failed:`, error);

          // Only clear UI state for actual authentication errors (401/403)
          // For network errors (CORS, connectivity issues), keep showing authenticated state
          if (error?.isAuthError) {
            console.log(`[OpenCard] ${instanceIdRef.current}: Authentication error, clearing UI state`);
            setIsAuthenticated(false);
            setUser(null);
            setClient(openaiClient || null);
          } else {
            console.log(`[OpenCard] ${instanceIdRef.current}: Network error, keeping UI authenticated for retry`);
            // Don't change UI state - user remains visually authenticated
            // The next API call or manual refresh will try again
            // Session metadata is preserved in the client for future attempts
          }
        }
      }
    };

    initializeAuth();

    // Enhanced cleanup function for hot reloads
    return () => {
      if (typeof window !== 'undefined' && instanceIdRef.current) {
        const globalState = window.__OPENCARD_PROVIDER_STATE;
        globalState.instanceCount--;

        console.log(`[OpenCard] ${instanceIdRef.current}: Cleanup (remaining instances: ${globalState.instanceCount})`);

        // If this was the active provider, clear it
        if (globalState.activeProvider === instanceIdRef.current) {
          globalState.activeProvider = null;
          console.log(`[OpenCard] ${instanceIdRef.current}: Cleared active provider`);
        }

        // Remove from pending cleanups
        globalState.pendingCleanups.delete(instanceIdRef.current);

        // Reset global state if this is the last instance
        if (globalState.instanceCount <= 0) {
          globalState.initialized = false;
          globalState.activeProvider = null;
          globalState.pendingCleanups.clear();
          console.log(`[OpenCard] ${instanceIdRef.current}: Reset global state (last instance)`);
        }
      }
    };
  }, [opencardClient, createOpenAIClient, openaiClient]);

  const value = useMemo(
    () => ({
      client,
      isAuthenticated,
      isAuthenticating,
      user,
      signIn,
      signOut,
      opencardClient, // Expose the OpenCard client for debugging
    }),
    [client, isAuthenticated, isAuthenticating, user, signIn, signOut, opencardClient]
  );

  return <OpenCardContext.Provider value={value}>{children}</OpenCardContext.Provider>;
}