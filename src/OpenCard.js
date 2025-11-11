/**
 * OpenCard SDK - Universal AI Wallet Client
 *
 * A minimal wrapper around the OpenAI SDK that points to OpenCard's API.
 * Provides the same API surface as OpenAI SDK for easy migration.
 */

import OpenAI from 'openai';

const DEFAULT_BASE_URL = 'https://api.opencard.ai/v1';

export class OpenCard extends OpenAI {
  constructor({
    apiKey,
    baseURL,
    ...options
  } = {}) {
    // Use environment variable fallback for baseURL
    // Note: Bundlers (esbuild/webpack/vite) replace process.env.* at build time
    const finalBaseURL =
      baseURL ||
      process.env?.OPENCARD_API_BASE ||
      process.env?.NEXT_PUBLIC_OPENCARD_API_BASE ||
      DEFAULT_BASE_URL;

    super({
      apiKey,
      baseURL: finalBaseURL,
      ...options
    });
  }
}

export default OpenCard;
