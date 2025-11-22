import { useEffect } from 'react';
import { useOpenCard } from './OpenCardProvider.jsx';

/**
 * Hook that fires when user returns from authentication
 * Use this to resume interrupted requests after auth redirect
 *
 * @param {Function} callback - Called with saved request data when auth completes
 * @param {Object} options - Configuration options
 * @param {boolean} options.autoRetry - If true, SDK automatically retries the request
 *
 * @example
 * // Basic usage - restore message to input
 * useAuthResume((savedRequest) => {
 *   const message = savedRequest.body.messages[0].content;
 *   setInputValue(message);
 * });
 *
 * @example
 * // Auto-retry - SDK retries request automatically
 * useAuthResume((result) => {
 *   if (result.success) {
 *     displayResponse(result.response);
 *   } else {
 *     handleError(result.error);
 *   }
 * }, { autoRetry: true });
 */
export function useAuthResume(callback, options = {}) {
  const { autoRetry = false } = options;
  const client = useOpenCard();

  useEffect(() => {
    if (!callback) return;

    const handleAuthResume = async (savedRequest) => {
      if (autoRetry) {
        // SDK auto-retries the request
        try {
          const response = await client.chat.completions.create(
            savedRequest.body
          );
          callback({ savedRequest, response, success: true });
        } catch (error) {
          callback({ savedRequest, error, success: false });
        }
      } else {
        // Just notify developer
        callback(savedRequest);
      }
    };

    const unsubscribe = client.onAuthResume(handleAuthResume);

    return () => {
      unsubscribe();
    };
  }, [callback, autoRetry, client]);
}
