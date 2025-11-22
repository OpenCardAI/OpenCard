/**
 * OpenCard SDK - Universal AI Wallet Client (Browser Only)
 *
 * A minimal wrapper around the OpenAI SDK that points to OpenCard's API.
 * Uses session-based authentication (cookies) - no API keys required.
 *
 * Backend API Contract:
 * - Return 401 with { error: { loginUrl: "..." } } when not authenticated
 * - Return 402 with { error: { checkoutUrl: "..." } } when no credits
 * - Support credentials: 'include' for session cookies
 */

import OpenAI from 'openai';

const DEFAULT_BASE_URL = 'https://api.opencard.ai/v1';

export class OpenCard extends OpenAI {
  // Storage configuration for auth resume
  static STORAGE_KEY = 'opencard_pending';
  static STATE_VERSION = 1;
  static EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  constructor({ baseURL, ...options } = {}) {
    // Browser-only enforcement
    if (typeof window === 'undefined') {
      throw new Error(
        'OpenCard SDK is currently only supported in browser environments. ' +
        'Server-side support is coming soon.'
      );
    }

    // Use environment variable fallback for baseURL
    // Note: Bundlers replace process.env.* at build time
    const finalBaseURL =
      baseURL ||
      process.env?.OPENCARD_API_BASE ||
      process.env?.NEXT_PUBLIC_OPENCARD_API_BASE ||
      DEFAULT_BASE_URL;

    // Custom fetch that includes credentials for session cookies
    const customFetch = (url, init) => {
      return fetch(url, {
        ...init,
        credentials: 'include'
      });
    };

    // Initialize OpenAI SDK with no API key (session auth only)
    super({
      apiKey: 'not-needed', // Dummy value, actual auth via session cookies
      baseURL: finalBaseURL,
      dangerouslyAllowBrowser: true, // Safe because we use session auth, not API keys
      fetch: customFetch, // Use custom fetch to include credentials
      ...options
    });

    // Auth resume callbacks
    this._authCallbacks = [];

    // Page restore callbacks (for bfcache)
    this._pageRestoreCallbacks = [];

    // Check for auth resume on init
    // Use setTimeout to ensure listeners are registered first
    setTimeout(() => this._checkAuthResume(), 0);

    // Listen for page restore from bfcache (back/forward button)
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        // Page was restored from bfcache, notify all registered callbacks
        this._pageRestoreCallbacks.forEach(callback => {
          try {
            callback();
          } catch (error) {
            console.error('OpenCard: Error in page restore callback:', error);
          }
        });
      }
    });
  }

  /**
   * Create a Vercel AI SDK compatible provider
   * Requires @ai-sdk/openai to be installed
   *
   * @param {string} modelName - Model identifier (e.g., 'gpt-4o', 'gpt-4o-mini')
   * @returns {Promise<LanguageModelV1>} Vercel AI SDK language model
   *
   * @example
   * import { streamText } from 'ai';
   * const opencard = new OpenCard();
   * const model = await opencard.provider('gpt-4o');
   * const result = await streamText({
   *   model,
   *   messages: [{ role: 'user', content: 'Hello!' }]
   * });
   */
  async provider(modelName) {
    try {
      // Dynamic import to make @ai-sdk/openai optional (works in ESM environments)
      const { createOpenAI } = await import('@ai-sdk/openai');

      // Create OpenAI provider with OpenCard baseURL
      const openai = createOpenAI({
        apiKey: 'not-needed', // Session auth via cookies
        baseURL: this.baseURL,
        fetch: (url, init) => {
          // Include credentials for session cookies
          return fetch(url, {
            ...init,
            credentials: 'include'
          });
        }
      });

      return openai(modelName);
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message?.includes('@ai-sdk/openai')) {
        throw new Error(
          'The .provider() method requires @ai-sdk/openai to be installed.\n' +
          'Install it with: npm install @ai-sdk/openai'
        );
      }
      throw error;
    }
  }

  /**
   * Save pending request to sessionStorage before auth redirect
   * @private
   */
  _saveRequest(options) {
    const state = {
      version: OpenCard.STATE_VERSION,
      timestamp: Date.now(),
      expiresAt: Date.now() + OpenCard.EXPIRY_MS,
      request: {
        method: options.method,
        path: options.path,
        body: options.body
      }
    };

    try {
      sessionStorage.setItem(OpenCard.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('OpenCard: Failed to save pending request:', error);
    }
  }

  /**
   * Retrieve saved request from sessionStorage
   * @private
   * @returns {Object|null} Saved request or null if not found/expired
   */
  _retrieveRequest() {
    try {
      const saved = sessionStorage.getItem(OpenCard.STORAGE_KEY);
      if (!saved) return null;

      const state = JSON.parse(saved);

      // Validate version
      if (state.version !== OpenCard.STATE_VERSION) {
        this._clearPendingRequest();
        return null;
      }

      // Check expiry
      if (Date.now() > state.expiresAt) {
        this._clearPendingRequest();
        return null;
      }

      return state.request;
    } catch (error) {
      console.warn('OpenCard: Failed to retrieve pending request:', error);
      return null;
    }
  }

  /**
   * Clear pending request from storage
   * @private
   */
  _clearPendingRequest() {
    sessionStorage.removeItem(OpenCard.STORAGE_KEY);
  }

  /**
   * Check if user just returned from auth and restore pending request
   * @private
   */
  _checkAuthResume() {
    const params = new URLSearchParams(window.location.search);

    // Check if returning from auth
    if (!params.has('opencard_auth_success')) return;

    // Get saved request
    const savedRequest = this._retrieveRequest();
    if (!savedRequest) return;

    // Clean up URL
    params.delete('opencard_auth_success');
    const cleanUrl = window.location.pathname +
      (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, '', cleanUrl);

    // Clear storage
    this._clearPendingRequest();

    // Notify all registered callbacks
    this._authCallbacks.forEach(callback => {
      try {
        callback(savedRequest);
      } catch (error) {
        console.error('OpenCard: Error in auth resume callback:', error);
      }
    });
  }

  /**
   * Register a callback to be called when user returns from authentication
   * Use this to resume interrupted requests
   *
   * @param {Function} callback - Function to call with saved request data
   * @returns {Function} Unsubscribe function
   *
   * @example
   * const unsubscribe = client.onAuthResume((savedRequest) => {
   *   console.log('User authenticated! Saved request:', savedRequest);
   *   // Resume the request or restore UI state
   * });
   *
   * // Later, to stop listening:
   * unsubscribe();
   */
  onAuthResume(callback) {
    if (typeof callback !== 'function') {
      throw new Error('OpenCard: onAuthResume requires a callback function');
    }

    this._authCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this._authCallbacks.indexOf(callback);
      if (index > -1) {
        this._authCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Register a callback to be called when page is restored from bfcache
   * Use this to reset UI state when user hits back/forward button
   *
   * @param {Function} callback - Function to call when page is restored
   * @returns {Function} Unsubscribe function
   *
   * @example
   * const unsubscribe = client.onPageRestore(() => {
   *   console.log('Page restored from cache');
   *   // Reset your UI state (re-enable buttons, clear loading states, etc.)
   *   submitButton.disabled = false;
   *   output.textContent = 'Ready';
   * });
   *
   * // Later, to stop listening:
   * unsubscribe();
   */
  onPageRestore(callback) {
    if (typeof callback !== 'function') {
      throw new Error('OpenCard: onPageRestore requires a callback function');
    }

    this._pageRestoreCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this._pageRestoreCallbacks.indexOf(callback);
      if (index > -1) {
        this._pageRestoreCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Override request to add session-based auth support
   * Handles 401/402 errors with automatic redirects
   */
  async request(options, remainingRetries) {
    // Add current URL as custom header so API knows where to return user
    if (!options.headers) {
      options.headers = {};
    }
    options.headers['X-Return-To'] = window.location.href;

    try {
      return await super.request(options, remainingRetries);
    } catch (error) {
      // 401 - Not authenticated, save request and redirect to login
      if (error.status === 401 && error.error?.loginUrl) {
        // Save request before redirect
        this._saveRequest(options);

        // Capture current URL to return to after auth
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('oc_session'); // Clean existing session params
        currentUrl.searchParams.set('opencard_auth_success', '1'); // Add success flag

        // Append return_to to loginUrl
        const loginUrl = new URL(error.error.loginUrl);
        loginUrl.searchParams.set('return_to', currentUrl.href);

        window.location.href = loginUrl.href;
        return new Promise(() => {});
      }

      // 402 - Insufficient credits, redirect to checkout
      if (error.status === 402 && error.error?.checkoutUrl) {
        // Capture current URL to return to after payment
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('oc_session'); // Clean existing session params

        // Append return_to to checkoutUrl
        const checkoutUrl = new URL(error.error.checkoutUrl);
        checkoutUrl.searchParams.set('return_to', currentUrl.href);

        window.location.href = checkoutUrl.href;
        return new Promise(() => {});
      }

      // Re-throw original error
      throw error;
    }
  }
}

export default OpenCard;
