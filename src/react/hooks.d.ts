/**
 * React Hooks TypeScript Definitions
 *
 * Type definitions for OpenCard React hooks.
 */

import { SavedRequest } from '../OpenCard';

/**
 * Options for useAuthResume hook
 */
export interface UseAuthResumeOptions {
  /**
   * If true, SDK automatically retries the request after auth completes
   * If false, callback just receives the saved request data
   *
   * @default false
   */
  autoRetry?: boolean;
}

/**
 * Result passed to callback when autoRetry is enabled
 */
export interface AuthResumeResult {
  savedRequest: SavedRequest;
  response?: any;
  error?: Error;
  success: boolean;
}

/**
 * Hook that fires when user returns from authentication
 *
 * Use this to resume interrupted requests after auth redirect.
 * The SDK saves pending requests to sessionStorage before redirecting,
 * then restores them when the user returns.
 *
 * @param callback - Called with saved request data (or result if autoRetry enabled)
 * @param options - Configuration options
 *
 * @example
 * ```typescript
 * // Basic usage - restore message to input
 * useAuthResume((savedRequest) => {
 *   const message = savedRequest.body.messages[0].content;
 *   setInputValue(message);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Auto-retry - SDK retries request automatically
 * useAuthResume((result) => {
 *   if (result.success) {
 *     displayResponse(result.response);
 *   } else {
 *     handleError(result.error);
 *   }
 * }, { autoRetry: true });
 * ```
 */
export function useAuthResume(
  callback: (data: SavedRequest | AuthResumeResult) => void,
  options?: UseAuthResumeOptions
): void;
