/**
 * OpenCard SDK TypeScript Definitions
 *
 * This file provides TypeScript type definitions for the OpenCard SDK,
 * which extends the OpenAI SDK for browser-based session authentication.
 *
 * Browser-only - throws error if used in Node.js/server environments.
 */

import OpenAI from 'openai';

/**
 * Saved request data structure
 *
 * Stored in sessionStorage when user needs to authenticate mid-request.
 * Restored after authentication completes.
 */
export interface SavedRequest {
  method: string;
  path: string;
  body: any;
}

/**
 * Callback function type for auth resume
 *
 * Called when user returns from authentication with saved request data.
 */
export type AuthResumeCallback = (savedRequest: SavedRequest) => void;

/**
 * OpenCard SDK Client (Browser Only)
 *
 * Extends the OpenAI SDK with session-based authentication.
 * No API keys required - uses browser cookies for authentication.
 *
 * @example
 * ```typescript
 * // Basic usage with OpenAI SDK API
 * const opencard = new OpenCard();
 * const response = await opencard.chat.completions.create({
 *   model: 'openai/gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 *
 * // Usage with Vercel AI SDK
 * import { streamText } from 'ai';
 * const result = await streamText({
 *   model: opencard.provider('openai/gpt-4o'),
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export class OpenCard extends OpenAI {
  /**
   * Constructor for OpenCard client
   *
   * @param options - Configuration options
   * @param options.baseURL - Custom API base URL (default: https://api.opencard.ai/v1)
   * @throws Error if called in non-browser environment (typeof window === 'undefined')
   */
  constructor(options?: {
    baseURL?: string;
    [key: string]: any;
  });

  /**
   * Create a Vercel AI SDK compatible provider
   *
   * Requires @ai-sdk/openai to be installed.
   * Returns a language model compatible with streamText() and generateText().
   *
   * @param modelName - Model identifier (e.g., 'openai/gpt-4o')
   * @returns Vercel AI SDK language model
   * @throws Error if @ai-sdk/openai is not installed
   *
   * @example
   * ```typescript
   * import { streamText } from 'ai';
   *
   * const opencard = new OpenCard();
   * const result = await streamText({
   *   model: opencard.provider('openai/gpt-4o'),
   *   messages: [{ role: 'user', content: 'Hello!' }]
   * });
   * ```
   */
  provider(modelName: string): any;

  /**
   * Register a callback to be called when user returns from authentication
   *
   * Use this to resume interrupted requests after authentication redirect.
   * The SDK automatically saves pending requests to sessionStorage before
   * redirecting to login, then restores them when user returns.
   *
   * @param callback - Function to call with saved request data
   * @returns Unsubscribe function to stop listening
   *
   * @example
   * ```typescript
   * // Basic usage - restore message to input
   * const unsubscribe = client.onAuthResume((savedRequest) => {
   *   const message = savedRequest.body.messages[0].content;
   *   setInputValue(message);
   * });
   *
   * // Later, to stop listening:
   * unsubscribe();
   * ```
   */
  onAuthResume(callback: AuthResumeCallback): () => void;
}

export default OpenCard;
