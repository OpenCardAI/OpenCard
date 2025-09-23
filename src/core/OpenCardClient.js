import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthUrl,
  exchangeCodeForTokens,
} from './auth.js';
import {
  resolveClientId,
  resolveAuthUrl,
  getEnvironmentInfo,
} from './environment.js';

// Global singleton management for preventing multiple instances
if (typeof window !== 'undefined') {
  window.__OPENCARD_INSTANCES = window.__OPENCARD_INSTANCES || {
    clients: new Map(),
    globalSession: null,
    activeClientId: null,
    // Global request lock to prevent concurrent refresh calls
    refreshLock: {
      isLocked: false,
      currentRefreshPromise: null,
      lastRefreshTime: 0
    }
  };

  // Global debugging function
  window.__OPENCARD_DEBUG = () => {
    console.log('[OpenCard Debug] Current state:');
    console.log('  Global session:', window.__OPENCARD_INSTANCES.globalSession);
    console.log('  Active client ID:', window.__OPENCARD_INSTANCES.activeClientId);
    console.log('  Refresh lock:', window.__OPENCARD_INSTANCES.refreshLock);
    console.log('  Registered instances:');
    for (const [key, client] of window.__OPENCARD_INSTANCES.clients) {
      console.log(`    ${key}: ${client.instanceId} (hasToken: ${!!client.session?.accessToken})`);
    }
  };
}

function getInstanceKey(config) {
  return `${config.authUrl || 'default'}-${config.clientId || 'default'}`;
}

// Session persistence helpers - store metadata only, never tokens
const SESSION_STORAGE_KEY = 'opencard_session_meta';

function saveSessionMetadata(session) {
  if (typeof window === 'undefined' || !session) return;

  try {
    // Only save non-sensitive metadata
    const metadata = {
      accessExpires: session.accessExpires,
      ephemeralExpires: session.ephemeralExpires,
      user: session.user,
      savedAt: Date.now()
    };
    // Use localStorage for cross-tab persistence
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(metadata));
    console.log('[OpenCard] Saved session metadata to localStorage');
  } catch (error) {
    console.warn('[OpenCard] Failed to save session metadata:', error);
  }
}

function loadSessionMetadata() {
  if (typeof window === 'undefined') return null;

  try {
    // Use localStorage for cross-tab persistence
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return null;

    const metadata = JSON.parse(stored);
    console.log('[OpenCard] Loaded session metadata from localStorage');
    return metadata;
  } catch (error) {
    console.warn('[OpenCard] Failed to load session metadata:', error);
    return null;
  }
}

function clearSessionMetadata() {
  if (typeof window === 'undefined') return;

  try {
    // Use localStorage for cross-tab persistence
    localStorage.removeItem(SESSION_STORAGE_KEY);
    console.log('[OpenCard] Cleared session metadata from localStorage');
  } catch (error) {
    console.warn('[OpenCard] Failed to clear session metadata:', error);
  }
}

export class OpenCardClient {
  constructor(config = {}) {
    // Resolve environment-specific configuration first
    const resolvedClientId = resolveClientId(config.clientId || '');
    const resolvedAuthUrl = resolveAuthUrl(config.authUrl);

    const resolvedConfig = {
      authUrl: resolvedAuthUrl,
      apiUrl: config.apiUrl || 'https://api.opencard.ai/v1',
      clientId: resolvedClientId,
      redirectUri: config.redirectUri || (typeof window !== 'undefined' ? window.location.origin : ''),
      // Store original base client ID for reference
      baseClientId: config.clientId || '',
    };

    // TRUE SINGLETON: Check for existing instance and return it instead of creating new one
    if (typeof window !== 'undefined') {
      const instanceKey = getInstanceKey(resolvedConfig);
      const existingClient = window.__OPENCARD_INSTANCES.clients.get(instanceKey);

      if (existingClient) {
        console.log(`[OpenCard] Returning existing singleton client for config: ${instanceKey}`);
        // Return the existing instance directly - no new instance created
        return existingClient;
      }
    }

    // Only create new instance if no existing one found
    // Generate unique instance ID
    this.instanceId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.config = resolvedConfig;

    console.log(`[OpenCard] ${this.instanceId}: Creating new singleton client for config: ${getInstanceKey(this.config)}`);

    // Initialize session from global state, storage, or create empty
    if (typeof window !== 'undefined') {
      const instanceKey = getInstanceKey(this.config);

      // Priority 1: Check for global session from hot reload
      if (window.__OPENCARD_INSTANCES.globalSession) {
        console.log(`[OpenCard] ${this.instanceId}: Restoring session from global state`);
        this.session = { ...window.__OPENCARD_INSTANCES.globalSession };
      }
      // Priority 2: Check for persisted session metadata
      else {
        const metadata = loadSessionMetadata();
        if (metadata && metadata.accessExpires && metadata.accessExpires > Date.now()) {
          console.log(`[OpenCard] ${this.instanceId}: Found valid session metadata in storage`);
          // Initialize session with metadata (tokens will be null, requiring refresh)
          this.session = {
            accessToken: null, // Token not persisted for security
            accessExpires: metadata.accessExpires,
            ephemeralKey: null, // Token not persisted for security
            ephemeralExpires: metadata.ephemeralExpires,
            user: metadata.user,
          };
          // Mark that we have session metadata but need token refresh
          this.hasSessionMetadata = true;
        } else {
          // Initialize empty session
          this.session = {
            accessToken: null,
            accessExpires: null,
            ephemeralKey: null,
            ephemeralExpires: null,
            user: null,
          };
          this.hasSessionMetadata = false;
        }
      }

      // Register this instance as the singleton
      window.__OPENCARD_INSTANCES.clients.set(instanceKey, this);
      window.__OPENCARD_INSTANCES.activeClientId = instanceKey;
    } else {
      // Server-side fallback
      this.session = {
        accessToken: null,
        accessExpires: null,
        ephemeralKey: null,
        ephemeralExpires: null,
        user: null,
      };
    }

    this.openaiClient = null;

    // Simple concurrency control
    this.refreshInProgress = false;

    // Store environment info for debugging
    this.environmentInfo = getEnvironmentInfo();

    // Set up BroadcastChannel for multi-tab communication
    if (typeof window !== 'undefined') {
      this.channel = new BroadcastChannel('opencard');
      this.channel.addEventListener('message', (event) => {
        if (event.data.type === 'logout') {
          // Only clear session on explicit logout
          this.clearSession();
        } else if (event.data.type === 'auth-updated') {
          // Simple debouncing: only refresh if not already in progress
          if (!this.refreshInProgress) {
            setTimeout(() => {
              if (!this.refreshInProgress) {
                // Try to refresh, but don't clear session if it fails
                // The user might still have valid cookies for the next refresh attempt
                this.ensureFresh().catch((error) => {
                  console.log(`[OpenCard] ${this.instanceId}: Background refresh failed in BroadcastChannel handler:`, error);
                  // DO NOT clear session here - this prevents cascade logouts
                  // The session will naturally expire based on accessExpires timestamp
                });
              }
            }, 200); // Simple 200ms debounce
          }
        } else if (event.data.type === 'session-updated' && event.data.session) {
          // New message type for syncing successful auth across tabs
          console.log(`[OpenCard] ${this.instanceId}: Received session update from another tab`);
          this.session = { ...event.data.session };
          // Also update global state
          if (window.__OPENCARD_INSTANCES) {
            window.__OPENCARD_INSTANCES.globalSession = { ...this.session };
          }
        }
      });
    }
  }

  async ensureFresh() {
    // Enhanced debugging for multi-instance issues
    console.log(`[OpenCard] ${this.instanceId}: ensureFresh called`);

    // GLOBAL REFRESH LOCK: Check if any instance is already refreshing
    if (typeof window !== 'undefined') {
      const globalLock = window.__OPENCARD_INSTANCES.refreshLock;

      // If global refresh is in progress, wait for the existing promise
      if (globalLock.isLocked && globalLock.currentRefreshPromise) {
        console.log(`[OpenCard] ${this.instanceId}: Global refresh in progress, waiting for shared promise...`);
        try {
          const result = await globalLock.currentRefreshPromise;
          // Sync the result to this instance
          if (result && result.accessToken) {
            console.log(`[OpenCard] ${this.instanceId}: Synced session from global refresh`);
            this.session = { ...result };
          }
          return this.session;
        } catch (error) {
          console.log(`[OpenCard] ${this.instanceId}: Global refresh failed, will try our own refresh`);
          // Global refresh failed, we'll try our own refresh below
        }
      }

      // Check for session conflicts across instances (now there should be only one)
      const instanceKey = getInstanceKey(this.config);
      const instances = Array.from(window.__OPENCARD_INSTANCES.clients.entries())
        .filter(([key]) => key === instanceKey);

      if (instances.length > 1) {
        console.warn(`[OpenCard] ${this.instanceId}: Multiple instances detected (${instances.length}) for config: ${instanceKey}`);
        instances.forEach(([key, client]) => {
          console.log(`[OpenCard] Instance ${client.instanceId}: hasToken=${!!client.session?.accessToken}, expires=${client.session?.accessExpires}`);
        });
      }
    }

    // Local deduplication: if refresh is in progress, wait for it
    if (this.refreshInProgress) {
      console.log(`[OpenCard] ${this.instanceId}: Local refresh already in progress, waiting...`);
      // Simple wait loop (max 10 seconds)
      let attempts = 0;
      while (this.refreshInProgress && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      return this.session;
    }

    // IMMEDIATE SESSION SYNC: Check global state for fresh session before making API calls
    if (typeof window !== 'undefined' && window.__OPENCARD_INSTANCES.globalSession) {
      const globalSession = window.__OPENCARD_INSTANCES.globalSession;
      if (globalSession.accessToken && globalSession.accessExpires > Date.now()) {
        console.log(`[OpenCard] ${this.instanceId}: Found fresh session in global state, syncing immediately`);
        this.session = { ...globalSession };
        return this.session;
      }
    }

    console.log('ensureFresh: Starting refresh check');
    console.log('ensureFresh: Current session:', {
      hasAccessToken: !!this.session.accessToken,
      accessExpires: this.session.accessExpires,
      now: Date.now(),
      isExpired: this.session.accessExpires <= Date.now()
    });

    // Check if we have a valid access token with sufficient time remaining
    if (this.session.accessToken && this.session.accessExpires > Date.now()) {
      const timeRemaining = this.session.accessExpires - Date.now();
      const fiveMinutesInMs = 5 * 60 * 1000;

      // If token is valid for more than 5 minutes, skip refresh
      if (timeRemaining > fiveMinutesInMs) {
        console.log(`ensureFresh: Token still valid for ${Math.round(timeRemaining / 1000)}s (> 5 min), skipping refresh`);
        return this.session;
      }

      console.log(`ensureFresh: Token expires soon (${Math.round(timeRemaining / 1000)}s remaining), will refresh`);
    }

    // ACQUIRE GLOBAL LOCK before starting refresh
    if (typeof window !== 'undefined') {
      const globalLock = window.__OPENCARD_INSTANCES.refreshLock;
      globalLock.isLocked = true;
      globalLock.lastRefreshTime = Date.now();
      console.log(`[OpenCard] ${this.instanceId}: Acquired global refresh lock`);
    }

    this.refreshInProgress = true;

    // Create the refresh promise and store it globally for sharing
    const refreshPromise = this._performRefresh();
    if (typeof window !== 'undefined') {
      window.__OPENCARD_INSTANCES.refreshLock.currentRefreshPromise = refreshPromise;
    }

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      // RELEASE GLOBAL LOCK
      if (typeof window !== 'undefined') {
        const globalLock = window.__OPENCARD_INSTANCES.refreshLock;
        globalLock.isLocked = false;
        globalLock.currentRefreshPromise = null;
        console.log(`[OpenCard] ${this.instanceId}: Released global refresh lock`);
      }
      this.refreshInProgress = false;
    }
  }

  async _performRefresh() {
    console.log('ensureFresh: Need to refresh tokens');
    console.log('ensureFresh: Making refresh request to:', `${this.config.authUrl}/api/oauth/token`);
    console.log('ensureFresh: Client ID:', this.config.clientId);

    // Note: Removed proactive session validation as /api/auth/me endpoint
    // doesn't exist or isn't CORS-configured. The httpOnly cookies work fine
    // for the actual token refresh, so we'll rely on that mechanism.

    // Simple retry logic for network failures
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`ensureFresh: Attempt ${attempt}/2`);

        // DEBUGGING: Log session cookies being sent and validate session
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const allCookies = document.cookie;
          const sessionCookies = allCookies.split(';')
            .map(c => c.trim())
            .filter(c => c.includes('session') || c.includes('opencard') || c.includes('auth'))
            .join('; ');

          console.log('ensureFresh: All cookies (JavaScript visible):', allCookies);
          console.log('ensureFresh: Session-related cookies:', sessionCookies || 'None found');

          // Extract specific session ID if present
          const sessionIdMatch = allCookies.match(/(?:^|;\s*)(?:session|opencard)[^=]*=([^;]+)/);
          if (sessionIdMatch) {
            console.log('ensureFresh: Session ID being sent:', sessionIdMatch[1]);
          } else {
            console.log('ensureFresh: No session ID cookie found in JavaScript-visible cookies');
            console.log('⚠️  IMPORTANT: HttpOnly session cookies are invisible to JavaScript!');
            console.log('📋 TO DEBUG: Open browser DevTools → Application/Storage → Cookies → http://localhost:3000');
            console.log('   Look for session-related cookies (connect.sid, session, opencard_session, etc.)');
            console.log('   Check if they exist and their expiration times');
          }

          // Log current session metadata for comparison
          if (this.session) {
            console.log('ensureFresh: Current session metadata:', {
              hasAccessToken: !!this.session.accessToken,
              accessExpires: this.session.accessExpires,
              expiresInMinutes: this.session.accessExpires ? Math.round((this.session.accessExpires - Date.now()) / 60000) : null,
              hasUser: !!this.session.user
            });
          }
        }

        // Attempt silent refresh using httpOnly cookie
        const response = await fetch(`${this.config.authUrl}/api/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-OC-Client': 'opencard-sdk',
            'X-OC-Client-Id': this.config.clientId,
          },
          credentials: 'include', // Include httpOnly cookies
          body: JSON.stringify({
            grant_type: 'refresh_token',
            client_id: this.config.clientId,
          }),
        });

        console.log('ensureFresh: Response status:', response.status);
        console.log('ensureFresh: Response headers:', Object.fromEntries(response.headers.entries()));

        // TRACK SESSION ROTATION: Check for new session cookies in response
        this.trackSessionChanges(response);

        if (!response.ok) {
          let errorText = '';
          let errorData = null;

          try {
            errorText = await response.text();
            console.log('ensureFresh: Error response body:', errorText);
          } catch (textError) {
            console.log('ensureFresh: Failed to read error response body (CORS?):', textError.message);
            errorText = `Failed to read error response: ${textError.message}`;
          }

          // Enhanced error parsing with fallbacks for CORS scenarios
          try {
            if (errorText) {
              errorData = JSON.parse(errorText);
              console.log('ensureFresh: Parsed error data:', errorData);
            }
          } catch (e) {
            console.log('ensureFresh: Error response not JSON, analyzing as text');
          }

          // Enhanced session expiry detection
          const isSessionExpired = errorData?.error === 'invalid_grant' ||
                                  errorData?.error_description?.includes('session') ||
                                  errorText.includes('Session has expired') ||
                                  errorText.includes('Session not found') ||
                                  errorText.includes('invalid_grant') ||
                                  errorText.includes('expired') ||
                                  errorText.includes('Invalid session');

          // For 400 errors, assume session expiry unless proven otherwise
          const is400SessionError = response.status === 400 && (
            isSessionExpired ||
            errorText === '' || // Empty response (likely CORS masking 400 invalid_grant)
            errorText.includes('Failed to read error response') // CORS prevented reading
          );

          console.log('ensureFresh: Session expiry analysis:', {
            status: response.status,
            isSessionExpired,
            is400SessionError,
            hasErrorText: !!errorText,
            errorDataType: typeof errorData
          });

          // Create error with enhanced classification
          const error = new Error(`Token refresh failed: ${response.status} - ${errorText || 'Unknown error (CORS?)'}`);
          error.status = response.status;
          error.isAuthError = response.status === 401 || response.status === 403 || isSessionExpired || is400SessionError;

          if (isSessionExpired) {
            console.log('ensureFresh: Session expired detected, will clear session');
          }

          throw error;
        }

        // Success - break out of retry loop
        const tokens = await response.json();
        console.log('ensureFresh: Received tokens:', {
          hasAccessToken: !!tokens.access_token,
          expiresIn: tokens.expires_in,
          hasUser: !!tokens.user
        });

        // Update memory-only session
        this.session = {
          accessToken: tokens.access_token,
          accessExpires: Date.now() + (tokens.expires_in * 1000),
          ephemeralKey: tokens.ephemeral_key, // Short-lived key for OpenAI API
          ephemeralExpires: Date.now() + ((tokens.ephemeral_expires_in || 300) * 1000),
          user: this.session.user, // Preserve user info
        };

        // Save to global state for hot reload persistence
        if (typeof window !== 'undefined') {
          window.__OPENCARD_INSTANCES.globalSession = { ...this.session };
          console.log(`[OpenCard] ${this.instanceId}: Saved session to global state`);

          // Save session metadata to persistent storage
          saveSessionMetadata(this.session);

          // Update all instances with same config (should be none due to singleton pattern)
          const instanceKey = getInstanceKey(this.config);
          for (const [key, client] of window.__OPENCARD_INSTANCES.clients) {
            if (key === instanceKey && client !== this) {
              client.session = { ...this.session };
              console.log(`[OpenCard] ${this.instanceId}: Synced session to instance ${client.instanceId}`);
            }
          }
        }

        console.log('ensureFresh: Successfully refreshed session');

        // DEBUGGING: Check if server set new cookies during refresh
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const refreshedCookies = document.cookie;
          console.log('ensureFresh: Cookies after successful refresh:', refreshedCookies || 'None visible');
          console.log('🔍 Check browser DevTools → Application → Cookies to see if httpOnly session cookies were updated');
          console.log('   Expected: Session cookies should have extended expiration times');
        }

        // Notify other tabs with the new session data
        if (this.channel) {
          // Send the session data so other tabs can sync immediately
          this.channel.postMessage({
            type: 'session-updated',
            session: this.session
          });
        }

        return this.session;
      } catch (error) {
        lastError = error;
        console.log(`ensureFresh: Attempt ${attempt} failed:`, error);

        // Mark network errors as non-auth errors for proper handling
        if (error.name === 'TypeError' || error.message.includes('Failed to fetch')) {
          error.isAuthError = false;
        }

        // Enhanced retry logic for different failure scenarios
        const isNetworkError = error.name === 'TypeError' || error.message.includes('Failed to fetch');

        if (attempt === 1) {
          if (isNetworkError) {
            console.log('ensureFresh: Network error, retrying in 500ms...');
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          } else if (error.isAuthError) {
            console.log('ensureFresh: Auth error on first attempt, checking for session rotation...');

            // If we detected session rotation recently, try one more time
            if (this.lastSessionRotation && (Date.now() - this.lastSessionRotation) < 60000) {
              console.log('ensureFresh: Recent session rotation detected, retrying once...');
              await new Promise(resolve => setTimeout(resolve, 1000)); // Longer delay for cookie propagation
              continue;
            }
          }
        }

        // Don't retry for auth errors (unless session rotation case above) or if this is the final attempt
        break;
      }
    }

    // All attempts failed
    console.log('ensureFresh: All attempts failed:', lastError);

    // Only clear session if this is an authentication error (401/403)
    // For network errors or server errors, keep session metadata so user stays "authenticated"
    // and we can retry the refresh later
    if (lastError?.isAuthError) {
      console.log('ensureFresh: Authentication error detected, initiating session recovery');

      // Use graceful session recovery instead of abrupt clearing
      await this.recoverSession();
    } else {
      console.log('ensureFresh: Network/server error, keeping session metadata for retry');
      // Don't clear session - let the user remain "authenticated" in the UI
      // The next API call will attempt refresh again
    }

    throw lastError;
  }

  async ensureAuthenticated() {
    // First try silent refresh
    try {
      return await this.ensureFresh();
    } catch (error) {
      // Silent refresh failed, redirect to login
      return this.redirectToLogin();
    }
  }

  async redirectToLogin() {
    // Clear any old PKCE parameters before starting new auth flow
    this.clearPKCEParameters();

    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Store PKCE parameters temporarily for callback (this is safe)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('opencard_code_verifier', codeVerifier);
      sessionStorage.setItem('opencard_state', state);
      // Store current URL to return user to exact same place after auth
      sessionStorage.setItem('opencard_return_url', window.location.href);
    }

    // Build authorization URL
    const authUrl = buildAuthUrl({
      authUrl: this.config.authUrl,
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      codeChallenge,
      state,
      scope: 'openid profile',
    });

    // Redirect to auth server
    if (typeof window !== 'undefined') {
      window.location.href = authUrl;
      // Never resolve - the page is navigating away
      // This prevents the calling code from mistakenly setting authenticated state
      return new Promise(() => {});
    }

    return null;
  }

  async handleRedirectCallback() {
    if (typeof window === 'undefined') return null;

    // Check hash first (preferred), fallback to query params for compatibility
    let hashParams = null;
    let code = null;
    let state = null;
    let error = null;

    if (window.location.hash) {
      // Parse hash parameters (remove the '#' first)
      hashParams = new URLSearchParams(window.location.hash.slice(1));
      code = hashParams.get('code');
      state = hashParams.get('state');
      error = hashParams.get('error');
    }

    // Fallback to query params if no hash parameters found
    if (!code && !error) {
      const urlParams = new URLSearchParams(window.location.search);
      code = urlParams.get('code');
      state = urlParams.get('state');
      error = urlParams.get('error');
    }

    // Handle OAuth errors
    if (error) {
      const errorDescription = hashParams ? hashParams.get('error_description') : new URLSearchParams(window.location.search).get('error_description');
      throw new Error(`OAuth error: ${error} - ${errorDescription}`);
    }

    // No code means this isn't a callback
    if (!code) return null;

    // IMMEDIATE URL CLEANUP for instant visual feedback
    // Do this BEFORE any async operations to hide the auth code instantly
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);

    // Validate state parameter
    const storedState = sessionStorage.getItem('opencard_state');
    if (state !== storedState) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }

    // Get stored code verifier
    const codeVerifier = sessionStorage.getItem('opencard_code_verifier');
    if (!codeVerifier) {
      throw new Error('Code verifier not found in session storage');
    }

    try {
      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens({
        authUrl: this.config.authUrl,
        clientId: this.config.clientId,
        redirectUri: this.config.redirectUri,
        code,
        codeVerifier,
      });

      // Update memory-only session
      // Include user info from token response for immediate display
      this.session = {
        accessToken: tokens.access_token,
        accessExpires: Date.now() + (tokens.expires_in * 1000),
        ephemeralKey: tokens.ephemeral_key,
        ephemeralExpires: Date.now() + ((tokens.ephemeral_expires_in || 300) * 1000),
        user: tokens.user || null, // Set immediately if available in token response
      };

      // Save to global state for hot reload persistence
      if (typeof window !== 'undefined') {
        window.__OPENCARD_INSTANCES.globalSession = { ...this.session };
        console.log(`[OpenCard] ${this.instanceId}: Saved callback session to global state`);

        // Save session metadata to persistent storage
        saveSessionMetadata(this.session);

        // Update all instances with same config
        const instanceKey = getInstanceKey(this.config);
        for (const [key, client] of window.__OPENCARD_INSTANCES.clients) {
          if (key === instanceKey && client !== this) {
            client.session = { ...this.session };
            console.log(`[OpenCard] ${this.instanceId}: Synced callback session to instance ${client.instanceId}`);
          }
        }
      }

      // Clean up PKCE parameters after successful processing
      this.clearPKCEParameters();

      // Return user to original page for seamless UX
      const returnUrl = sessionStorage.getItem('opencard_return_url');
      if (returnUrl) {
        // Compare URLs without hash fragments to avoid premature navigation
        const currentUrlWithoutHash = window.location.origin + window.location.pathname + window.location.search;
        const returnUrlObj = new URL(returnUrl);
        const returnUrlWithoutHash = returnUrlObj.origin + returnUrlObj.pathname + returnUrlObj.search;

        if (returnUrlWithoutHash !== currentUrlWithoutHash) {
          // Only navigate if we're actually on a different page
          sessionStorage.removeItem('opencard_return_url');
          window.location.href = returnUrl;
          return this.session; // Return early since we're navigating away
        }

        // Same page - just clean up the return URL
        sessionStorage.removeItem('opencard_return_url');
      }

      // Fetch user profile in background (non-blocking for faster UI updates)
      // This allows the UI to show "Authenticated" immediately while profile loads
      this.fetchUserProfile().catch(error => {
        console.warn('Failed to fetch user profile:', error);
      });

      // Notify other tabs of successful auth with session data
      if (this.channel) {
        this.channel.postMessage({
          type: 'session-updated',
          session: this.session
        });
      }

      return this.session;
    } catch (error) {
      // Clean up on error
      this.clearPKCEParameters();
      throw error;
    }
  }

  async fetchUserProfile() {
    if (!this.session?.accessToken) {
      return;
    }

    try {
      const response = await fetch(`${this.config.authUrl}/api/userinfo`, {
        headers: {
          'Authorization': `Bearer ${this.session.accessToken}`,
          'X-OC-Client': 'opencard-sdk',
          'X-OC-Client-Id': this.config.clientId,
        },
        credentials: 'include', // Include cookies
      });

      if (response.ok) {
        const userInfo = await response.json();
        // Merge with any existing user data from token response
        this.session.user = {
          ...(this.session.user || {}),
          ...userInfo
        };

        // Save updated user info to persistent storage
        saveSessionMetadata(this.session);

        // Notify UI of user profile update
        if (this.channel) {
          this.channel.postMessage({ type: 'profile-updated' });
        }
      }
    } catch (error) {
      // Silent fail - user profile is not critical for authentication
      console.warn('Failed to fetch user profile:', error);
    }
  }

  async authenticate(skipSilentRefresh = false) {
    // First, check if we're handling a callback
    const callbackResult = await this.handleRedirectCallback();
    if (callbackResult) {
      return callbackResult;
    }

    // If skipSilentRefresh is true (explicit sign-in), go directly to login
    if (skipSilentRefresh) {
      return await this.redirectToLogin();
    }

    // Otherwise, try silent refresh first (for auto-authentication on page load)
    return await this.ensureAuthenticated();
  }

  clearSession() {
    this.session = {
      accessToken: null,
      accessExpires: null,
      ephemeralKey: null,
      ephemeralExpires: null,
      user: null,
    };
    this.openaiClient = null;
    this.hasSessionMetadata = false;

    // Reset refresh state
    this.refreshInProgress = false;

    // Clear global session state
    if (typeof window !== 'undefined') {
      window.__OPENCARD_INSTANCES.globalSession = null;
      console.log(`[OpenCard] ${this.instanceId}: Cleared global session state`);

      // Clear session for all instances with same config
      const instanceKey = getInstanceKey(this.config);
      for (const [key, client] of window.__OPENCARD_INSTANCES.clients) {
        if (key === instanceKey) {
          client.session = { ...this.session };
          client.refreshInProgress = false;
          client.hasSessionMetadata = false;
          console.log(`[OpenCard] ${this.instanceId}: Cleared session for instance ${client.instanceId}`);
        }
      }
    }

    // Clear persistent session metadata
    clearSessionMetadata();

    // NOTE: DO NOT clear PKCE parameters here!
    // They must persist through the OAuth flow, even if session refresh fails
    // Only clear them after successful callback or when starting new auth flow
  }

  // Clear PKCE parameters - should only be called when appropriate
  clearPKCEParameters() {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('opencard_code_verifier');
      sessionStorage.removeItem('opencard_state');
      sessionStorage.removeItem('opencard_return_url');
      console.log(`[OpenCard] ${this.instanceId}: Cleared PKCE parameters`);
    }
  }

  // Graceful session recovery with fallback re-authentication
  async recoverSession() {
    console.log(`[OpenCard] ${this.instanceId}: Attempting session recovery`);

    try {
      // Clear any stale session data first
      this.handleCookieMismatch();

      // Clear session metadata but preserve user info if possible
      const userInfo = this.session?.user;
      this.clearSession();

      // Restore user info for better UX (they'll see they're signed out but know who they were)
      if (userInfo) {
        this.session.user = userInfo;
      }

      console.log('recoverSession: Session cleared, user will need to re-authenticate');
      console.log('💡 Recommendation: Show re-authentication prompt to user');

      // Notify other tabs about session recovery
      if (this.channel) {
        this.channel.postMessage({
          type: 'session-recovery-needed',
          reason: 'Session validation failed',
          timestamp: Date.now()
        });
      }

      return false; // Indicates recovery requires user action
    } catch (error) {
      console.error('recoverSession: Error during session recovery:', error);
      return false;
    }
  }

  // Proactive session validation - DISABLED due to CORS issues with /api/auth/me
  // The endpoint either doesn't exist or isn't CORS-configured for localhost:5173
  // Since httpOnly cookies work fine for token refresh, we rely on that mechanism
  /*
  async validateSession() {
    console.log(`[OpenCard] ${this.instanceId}: Validating session before refresh`);

    try {
      // Make a lightweight request to validate session
      const response = await fetch(`${this.config.authUrl}/api/auth/me`, {
        method: 'GET',
        credentials: 'include', // Include session cookies
        headers: {
          'X-OC-Client': 'opencard-sdk',
          'X-OC-Client-Id': this.config.clientId,
        },
      });

      console.log('validateSession: Response status:', response.status);

      if (response.ok) {
        console.log('✅ validateSession: Session is valid');
        return true;
      } else if (response.status === 401 || response.status === 403) {
        console.log('❌ validateSession: Session is invalid (401/403)');
        return false;
      } else {
        console.log('⚠️  validateSession: Unexpected status, assuming valid for now:', response.status);
        return true; // Assume valid for network errors
      }
    } catch (error) {
      console.log('⚠️  validateSession: Error during validation, assuming valid:', error.message);
      return true; // Assume valid for network errors
    }
  }
  */

  // Track session changes from Set-Cookie headers to handle session rotation
  trackSessionChanges(response) {
    console.log(`[OpenCard] ${this.instanceId}: Tracking session changes from response`);

    if (!response || !response.headers) {
      console.log('trackSessionChanges: No response headers available');
      return;
    }

    // Extract Set-Cookie headers to detect session rotation
    const setCookieHeaders = [];

    // response.headers.get() returns first value, but we need all Set-Cookie headers
    // Use for...of to get all headers
    for (const [name, value] of response.headers) {
      if (name.toLowerCase() === 'set-cookie') {
        setCookieHeaders.push(value);
      }
    }

    if (setCookieHeaders.length === 0) {
      console.log('trackSessionChanges: No Set-Cookie headers found');
      return;
    }

    console.log('trackSessionChanges: Found Set-Cookie headers:', setCookieHeaders);

    // Parse session-related cookies
    const sessionCookies = [];
    for (const cookieHeader of setCookieHeaders) {
      // Parse cookie name=value; attributes format
      const cookieParts = cookieHeader.split(';');
      const [nameValue] = cookieParts;
      const [name, value] = nameValue.split('=').map(s => s.trim());

      // Check if this is a session-related cookie
      if (name && (
        name.includes('session') ||
        name.includes('connect.sid') ||
        name.includes('opencard') ||
        name.includes('auth')
      )) {
        sessionCookies.push({ name, value, header: cookieHeader });
        console.log(`trackSessionChanges: Found session cookie update: ${name} = ${value?.substring(0, 20)}...`);
      }
    }

    if (sessionCookies.length > 0) {
      console.log('🔄 SESSION ROTATION DETECTED: Server updated session cookies during refresh');
      console.log('   This may indicate server-side session rotation');
      console.log('   Client should handle this gracefully by updating session references');

      // Store session cookie information for debugging
      this.lastSessionCookies = sessionCookies;
      this.lastSessionRotation = Date.now();

      // Notify about session rotation for cross-tab coordination
      if (this.channel) {
        this.channel.postMessage({
          type: 'session-rotation-detected',
          cookies: sessionCookies,
          timestamp: this.lastSessionRotation
        });
      }
    }
  }

  // Handle cookie/session mismatches with additional cleanup
  handleCookieMismatch() {
    console.log(`[OpenCard] ${this.instanceId}: Handling cookie/session mismatch`);

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      // Log current cookie state for debugging
      const allCookies = document.cookie;
      console.log('handleCookieMismatch: Current cookies:', allCookies);

      // Try to clear any stale auth-related cookies by setting them to expire
      // Note: We can only clear cookies that were set by the same domain/path
      const cookiesToClear = ['session', 'opencard_session', 'auth_session', 'connect.sid'];

      for (const cookieName of cookiesToClear) {
        // Set cookie to expire in the past to delete it
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        console.log(`handleCookieMismatch: Attempted to clear cookie: ${cookieName}`);
      }

      // Clear any local/session storage that might be holding stale data
      try {
        // Clear localStorage entries that might be related to sessions
        const storageKeys = Object.keys(localStorage);
        for (const key of storageKeys) {
          if (key.includes('opencard') || key.includes('session') || key.includes('auth')) {
            localStorage.removeItem(key);
            console.log(`handleCookieMismatch: Cleared localStorage key: ${key}`);
          }
        }

        // Clear sessionStorage entries
        const sessionKeys = Object.keys(sessionStorage);
        for (const key of sessionKeys) {
          if (key.includes('opencard') || key.includes('session') || key.includes('auth')) {
            sessionStorage.removeItem(key);
            console.log(`handleCookieMismatch: Cleared sessionStorage key: ${key}`);
          }
        }
      } catch (error) {
        console.log('handleCookieMismatch: Error clearing storage:', error);
      }

      // Force a small delay to allow cookie changes to propagate
      setTimeout(() => {
        console.log('handleCookieMismatch: Cleanup complete, cookies after cleanup:', document.cookie);
      }, 100);
    }
  }

  async signOut() {
    // Clear session from memory
    this.clearSession();

    // Clear PKCE parameters on explicit sign out
    this.clearPKCEParameters();

    // Notify other tabs
    if (this.channel) {
      this.channel.postMessage({ type: 'logout' });
    }
  }

  getSession() {
    return this.session;
  }

  getUser() {
    // Return user info from session
    return this.session?.user || null;
  }


  createOpenAIClient(OpenAI) {
    if (!this.session?.ephemeralKey) {
      throw new Error('Not authenticated or ephemeral key expired. Please sign in again.');
    }

    // Check if ephemeral key is still valid
    if (this.session.ephemeralExpires <= Date.now()) {
      throw new Error('Ephemeral key expired. Please refresh your session.');
    }

    // Always create a fresh client using only ephemeral keys
    this.openaiClient = new OpenAI({
      baseURL: this.config.apiUrl,
      apiKey: this.session.ephemeralKey,
      dangerouslyAllowBrowser: true,
    });

    return this.openaiClient;
  }

  isAuthenticated() {
    return !!(this.session?.accessToken && this.session.accessExpires > Date.now());
  }

  // Instant auth check - returns current session status without making any network requests
  checkAuthStatus() {
    // First check global session state for hot reload persistence
    if (typeof window !== 'undefined' && window.__OPENCARD_INSTANCES.globalSession) {
      const globalSession = window.__OPENCARD_INSTANCES.globalSession;
      if (globalSession.accessToken && globalSession.accessExpires > Date.now()) {
        // Sync global session to this instance
        this.session = { ...globalSession };
        console.log(`[OpenCard] ${this.instanceId}: Restored valid session from global state`);
        return {
          isAuthenticated: true,
          needsRefresh: globalSession.accessExpires < (Date.now() + 5 * 60 * 1000), // Needs refresh if expires in < 5 min
          session: this.session,
          hasTokens: true
        };
      }
    }

    // Check if we have session metadata from storage (page reload scenario)
    // For 30-day sessions, trust the metadata even if tokens are expired
    if (this.hasSessionMetadata) {
      console.log(`[OpenCard] ${this.instanceId}: Have session metadata, tokens need refresh`);
      return {
        isAuthenticated: true, // We know user is authenticated based on metadata
        needsRefresh: true, // Always need to refresh since we don't have tokens
        session: this.session,
        hasTokens: false // Indicates we have metadata but no tokens
      };
    }

    // Check instance session with actual tokens
    const hasValidToken = this.session?.accessToken && this.session.accessExpires > Date.now();
    const needsRefresh = hasValidToken && this.session.accessExpires < (Date.now() + 5 * 60 * 1000);

    return {
      isAuthenticated: hasValidToken || this.hasSessionMetadata, // Trust localStorage metadata for 30-day sessions
      needsRefresh: needsRefresh || !hasValidToken || this.hasSessionMetadata,
      session: hasValidToken ? this.session : (this.hasSessionMetadata ? this.session : null),
      hasTokens: hasValidToken
    };
  }

  getEnvironmentInfo() {
    return {
      ...this.environmentInfo,
      resolvedClientId: this.config.clientId,
      baseClientId: this.config.baseClientId,
      authUrl: this.config.authUrl,
    };
  }
}