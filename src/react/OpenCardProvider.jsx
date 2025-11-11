import React, { createContext, useContext, useMemo } from 'react';
import { OpenCard } from '../OpenCard.js';

const OpenCardContext = createContext(null);

/**
 * OpenCard Provider Component
 *
 * Wraps your app and provides OpenCard client to all child components.
 * The client is a wrapper around the OpenAI SDK pointed at OpenCard's API.
 *
 * @example
 * ```jsx
 * // Basic usage
 * <OpenCardProvider apiKey="sk-opencard-...">
 *   <App />
 * </OpenCardProvider>
 *
 * // Custom base URL
 * <OpenCardProvider apiKey="sk-opencard-..." baseURL="http://localhost:3000/v1">
 *   <App />
 * </OpenCardProvider>
 * ```
 */
export function OpenCardProvider({ apiKey, baseURL, children, ...options }) {
  // Stringify options for stable memoization (prevents re-creation on every render)
  const optionsKey = JSON.stringify(options);

  const client = useMemo(
    () => new OpenCard({ apiKey, baseURL, ...options }),
    [apiKey, baseURL, optionsKey]
  );

  return (
    <OpenCardContext.Provider value={client}>
      {children}
    </OpenCardContext.Provider>
  );
}

/**
 * Hook to access OpenCard client
 *
 * Returns the OpenCard client instance (extends OpenAI SDK).
 * Use it exactly like the OpenAI SDK.
 *
 * @returns {OpenCard} OpenCard client instance
 *
 * @example
 * ```jsx
 * function Chat() {
 *   const opencard = useOpenCard();
 *
 *   async function sendMessage(content) {
 *     const response = await opencard.chat.completions.create({
 *       model: 'gpt-4',
 *       messages: [{ role: 'user', content }],
 *     });
 *     console.log(response.choices[0].message.content);
 *   }
 *
 *   return <button onClick={() => sendMessage('Hello!')}>Send</button>;
 * }
 * ```
 */
export function useOpenCard() {
  const context = useContext(OpenCardContext);

  if (!context) {
    throw new Error('useOpenCard must be used within OpenCardProvider');
  }

  return context;
}
