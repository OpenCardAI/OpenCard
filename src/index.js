// Core client (extends OpenAI SDK)
export { OpenCard } from './OpenCard.js';
export { OpenCard as OpenAI } from './OpenCard.js'; // Drop-in replacement alias
export { default } from './OpenCard.js';

// React bindings
export { OpenCardProvider, useOpenCard } from './react/OpenCardProvider.jsx';
export { useAuthResume } from './react/hooks.js';
