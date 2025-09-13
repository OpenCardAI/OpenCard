import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthUrl,
  exchangeCodeForTokens,
} from './auth.js';

export class OpenCardClient {
  constructor(config = {}) {
    this.session = null;
    this.openaiClient = null;
    this.config = {
      authUrl: config.authUrl || 'https://auth.opencard.ai',
      apiUrl: config.apiUrl || 'https://api.opencard.ai/v1',
      clientId: config.clientId || '',
      redirectUri: config.redirectUri || (typeof window !== 'undefined' ? window.location.origin : ''),
    };
  }

  async ensureAuthenticated() {
    // Check if we already have a valid session
    if (this.session && this.session.expires_at > Date.now()) {
      return this.session;
    }

    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Store PKCE parameters for callback
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('opencard_code_verifier', codeVerifier);
      sessionStorage.setItem('opencard_state', state);
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
    }

    // This won't return in redirect flow
    return null;
  }

  async handleRedirectCallback() {
    if (typeof window === 'undefined') return null;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    // Handle OAuth errors
    if (error) {
      const errorDescription = urlParams.get('error_description');
      throw new Error(`OAuth error: ${error} - ${errorDescription}`);
    }

    // No code means this isn't a callback
    if (!code) return null;

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

      // Create session object
      this.session = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        expires_at: Date.now() + (tokens.expires_in * 1000),
        user: null, // Will fetch user info separately
      };

      // Store session in sessionStorage
      sessionStorage.setItem('opencard_session', JSON.stringify(this.session));

      // Clean up PKCE parameters
      sessionStorage.removeItem('opencard_code_verifier');
      sessionStorage.removeItem('opencard_state');

      // Clean URL parameters
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);

      // TODO: Fetch user profile
      await this.fetchUserProfile();

      return this.session;
    } catch (error) {
      // Clean up on error
      sessionStorage.removeItem('opencard_code_verifier');
      sessionStorage.removeItem('opencard_state');
      throw error;
    }
  }

  async fetchUserProfile() {
    if (!this.session?.access_token) return;

    try {
      // TODO: Replace with actual userinfo endpoint
      const response = await fetch(`${this.config.authUrl}/userinfo`, {
        headers: {
          'Authorization': `Bearer ${this.session.access_token}`,
        },
      });

      if (response.ok) {
        const userInfo = await response.json();
        this.session.user = userInfo;
        sessionStorage.setItem('opencard_session', JSON.stringify(this.session));
      }
    } catch (error) {
      console.warn('Failed to fetch user profile:', error);
    }
  }

  async authenticate() {
    // First, check if we're handling a callback
    const callbackResult = await this.handleRedirectCallback();
    if (callbackResult) {
      return callbackResult;
    }

    // If not a callback, initiate authentication
    return await this.ensureAuthenticated();
  }

  async signOut() {
    // Clear session from memory and storage
    this.session = null;
    this.openaiClient = null;
    
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('opencard_session');
      // Also clean up any lingering PKCE parameters
      sessionStorage.removeItem('opencard_code_verifier');
      sessionStorage.removeItem('opencard_state');
    }
  }

  getSession() {
    return this.session;
  }

  getUser() {
    // Return user info from session
    return this.session?.user || null;
  }

  // Load session from storage on initialization
  loadSessionFromStorage() {
    if (typeof window === 'undefined') return;

    try {
      const stored = sessionStorage.getItem('opencard_session');
      if (stored) {
        const session = JSON.parse(stored);
        // Check if session hasn't expired
        if (session.expires_at > Date.now()) {
          this.session = session;
        } else {
          // Clean up expired session
          sessionStorage.removeItem('opencard_session');
        }
      }
    } catch (error) {
      console.warn('Failed to load session from storage:', error);
      sessionStorage.removeItem('opencard_session');
    }
  }

  createOpenAIClient(OpenAI) {
    if (!this.session) {
      throw new Error('Not authenticated. Please sign in first.');
    }

    // Always create a fresh client (no caching issues)
    this.openaiClient = new OpenAI({
      baseURL: this.config.apiUrl,
      apiKey: this.session.apiKey || this.session.token,
      dangerouslyAllowBrowser: true, // Since we're in browser environment
      defaultHeaders: {
        'X-OpenCard-Session': this.session.token,
      },
    });

    return this.openaiClient;
  }

  isAuthenticated() {
    return !!this.session;
  }
}