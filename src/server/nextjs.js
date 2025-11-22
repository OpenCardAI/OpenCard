/**
 * Next.js Server Helper for OpenCard SDK
 *
 * Provides utilities for using OpenCard in Next.js server components.
 * Automatically handles session cookie forwarding from Next.js request context.
 *
 * NOTE: This module uses static imports of next/headers and @ai-sdk/openai.
 * Only import from '@opencard/sdk/server' in Next.js server contexts.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { cookies } from 'next/headers';

/**
 * Create OpenCard provider for Next.js server components
 * Supports both API key authentication and session-based authentication
 *
 * @param {Object} [options] - Configuration options
 * @param {string} [options.apiKey] - OpenCard API key (e.g., sk-opencard-...). If not provided, uses session auth via cookies.
 * @returns {ReturnType<import('@ai-sdk/openai').createOpenAI>} Configured OpenAI provider
 *
 * @example
 * // API key authentication (recommended for server-side apps)
 * import { createOpenCardProvider } from '@opencard/sdk/server';
 *
 * const opencard = createOpenCardProvider({
 *   apiKey: process.env.OPENCARD_API_KEY
 * });
 * const model = opencard('gpt-4o');
 *
 * @example
 * // Session authentication (for browser-based apps)
 * const opencard = createOpenCardProvider();
 * const model = opencard('gpt-4o');
 */
export function createOpenCardProvider(options = {}) {
  const baseURL = process.env.OPENCARD_API_BASE || 'http://localhost:3000/v1';
  const apiKey = options.apiKey || process.env.OPENCARD_API_KEY;

  // If API key is provided, use standard authentication
  if (apiKey) {
    return createOpenAI({
      apiKey,
      baseURL,
    });
  }

  // Otherwise, use session authentication with cookie forwarding
  return createOpenAI({
    apiKey: 'not-needed', // Session auth via cookies
    baseURL,
    fetch: async (url, init) => {
      // Get cookies from Next.js request context
      const cookieStore = await cookies();
      const cookieHeader = cookieStore
        .getAll()
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join('; ');

      return fetch(url, {
        ...init,
        headers: {
          ...init?.headers,
          Cookie: cookieHeader,
        },
        credentials: 'include',
      });
    },
  });
}
