# OpenCard SDK

Browser-only JavaScript SDK that lets your users pay for AI usage directly. No API keys, no billing code, no LLM costs.

## Features

- ✅ **No API keys required** - Users authenticate and pay for their own usage
- ✅ **OpenAI-compatible API** - Works exactly like OpenAI SDK
- ✅ **Multi-provider access** - OpenAI, Anthropic, Google, xAI, and more
- ✅ **Automatic checkout** - Users redirected to Stripe when credits run out
- ✅ **Vercel AI SDK support** - Works with `streamText()` and `generateText()`
- ✅ **TypeScript ready** - Full type definitions included
- ✅ **Minimal code** - Just ~150 lines on top of OpenAI SDK

## Installation

```bash
npm install @opencard/sdk openai
```

> `openai` is a peer dependency used for OpenAI-style request formatting.

## Quick Start

### OpenAI SDK API

```javascript
import OpenCard from "@opencard/sdk";

const opencard = new OpenCard(); // No API key required

// Use exactly like OpenAI client
const response = await opencard.chat.completions.create({
  model: "openai/gpt-4o",
  messages: [
    { role: "user", content: "Hello, world!" }
  ]
});

console.log(response.choices[0].message.content);
```

### Vercel AI SDK

```javascript
import OpenCard from "@opencard/sdk";
import { streamText } from 'ai';

const opencard = new OpenCard(); // No API key required

// Use with Vercel AI SDK
const result = await streamText({
  model: opencard.provider('openai/gpt-4o'),
  messages: [
    { role: "user", content: "Hello, world!" }
  ],
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

> **Note:** Model names use the `provider/model` format (e.g., `openai/gpt-4o`, `anthropic/claude-3-5-sonnet-20241022`)

### React

```jsx
import OpenCard from '@opencard/sdk';
import { OpenCardProvider, useOpenCard } from '@opencard/sdk';

function App() {
  return (
    <OpenCardProvider>
      <ChatComponent />
    </OpenCardProvider>
  );
}

function ChatComponent() {
  const opencard = useOpenCard();

  const handleChat = async () => {
    const response = await opencard.chat.completions.create({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'Hello!' }],
    });
    console.log(response.choices[0].message.content);
  };

  return <button onClick={handleChat}>Send Message</button>;
}
```

## How It Works

OpenCard works best in the browser, where it can use cookies and handle checkout automatically.

When your app makes an AI request:

1. **OpenCard checks the user's credit balance.**
2. If the user has enough credit, the request completes normally.
3. If not authenticated (401), OpenCard redirects to **login**.
4. If no credits (402), OpenCard provides a **secure Stripe Checkout URL** where they can top up.
5. After authentication/payment, **the user is redirected back to your app**.
6. Your OpenCard request **proceeds normally** — no extra logic needed.

Your users pay for their own AI usage. Your app **never incurs LLM costs** or handles any billing code.

## Handling Authentication Redirects

When users need to authenticate mid-request, the SDK automatically saves their request and restores it after login/checkout.

### React

```javascript
import { useAuthResume } from '@opencard/sdk';

function ChatApp() {
  const [input, setInput] = useState('');

  // Restore message after auth redirect
  useAuthResume((savedRequest) => {
    const message = savedRequest.body.messages[0].content;
    setInput(message); // Restore to input field
  });

  // Your chat logic...
}
```

### Vanilla JavaScript

```javascript
const opencard = new OpenCard();

// Register handler for auth completion
opencard.onAuthResume((savedRequest) => {
  // User just authenticated - restore their message
  const message = savedRequest.body.messages[0].content;
  document.getElementById('input').value = message;
});
```

### Auto-retry

Let the SDK automatically retry the request after authentication:

```javascript
useAuthResume((result) => {
  if (result.success) {
    // SDK already retried and got response
    displayMessage(result.response);
  } else {
    // Handle error
    console.error(result.error);
  }
}, { autoRetry: true });
```

**No message loss** - even through full-page redirects!

## API Reference

### Constructor Options

```javascript
const opencard = new OpenCard({
  baseURL: 'https://api.opencard.ai/v1',  // Optional: Custom endpoint (for local dev)
  timeout: 30000,                         // Optional: Request timeout (ms)
  maxRetries: 3,                          // Optional: Max retry attempts
});
```

All OpenAI SDK constructor options are supported (except `apiKey` - session auth only).

### Chat Completions

OpenAI-compatible chat API with streaming support:

```javascript
// Non-streaming
const response = await opencard.chat.completions.create({
  model: 'openai/gpt-4o',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain quantum computing in simple terms.' }
  ],
  temperature: 0.7,
  max_tokens: 500,
});

console.log(response.choices[0].message.content);

// Streaming
const stream = await opencard.chat.completions.create({
  model: 'anthropic/claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Write a story about a robot.' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

### Vercel AI SDK Integration

For using with Vercel AI SDK, install `@ai-sdk/openai`:

```bash
npm install @ai-sdk/openai ai
```

Then use the `.provider()` method:

```javascript
import OpenCard from '@opencard/sdk';
import { streamText } from 'ai';

const opencard = new OpenCard();

const result = await streamText({
  model: opencard.provider('openai/gpt-4o'),
  messages: [{ role: 'user', content: 'Hello!' }]
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

The `.provider()` method returns a Vercel AI SDK-compatible language model.

## React Hooks

### OpenCardProvider

Wraps your app and provides the OpenCard client to all child components:

```jsx
import { OpenCardProvider } from '@opencard/sdk';

function App() {
  return (
    <OpenCardProvider
      baseURL="http://localhost:3000/v1"  // Optional: for local development
    >
      <YourApp />
    </OpenCardProvider>
  );
}
```

You can pass any OpenAI SDK constructor options as props (except `apiKey`).

### useOpenCard Hook

Access the OpenCard client instance in any component:

```jsx
import { useOpenCard } from '@opencard/sdk';

function MyComponent() {
  const opencard = useOpenCard();

  const handleClick = async () => {
    const response = await opencard.chat.completions.create({
      model: 'anthropic/claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'Hello Claude!' }]
    });

    console.log(response.choices[0].message.content);
  };

  return <button onClick={handleClick}>Chat</button>;
}
```

### useAuthResume Hook

Handle auth redirects and restore user state:

```jsx
import { useAuthResume } from '@opencard/sdk';

function ChatComponent() {
  const [input, setInput] = useState('');

  // Restore message after user authenticates/pays
  useAuthResume((savedRequest) => {
    const message = savedRequest.body.messages[0].content;
    setInput(message);
  });

  // Your chat logic...
}
```

## Local Development

Point the SDK to your local API server:

```javascript
const opencard = new OpenCard({
  baseURL: 'http://localhost:3000/v1'
});
```

Or use environment variables:

```bash
# Next.js / Vite (must start with NEXT_PUBLIC_ or VITE_)
NEXT_PUBLIC_OPENCARD_API_BASE=http://localhost:3000/v1
```

Priority order:
1. Explicit `baseURL` in constructor (highest)
2. `OPENCARD_API_BASE` environment variable
3. `NEXT_PUBLIC_OPENCARD_API_BASE` environment variable
4. `https://api.opencard.ai/v1` (default)

### Building the SDK

```bash
# Install dependencies
npm install

# Build the SDK (ESM + CJS)
npm run build

# Watch mode for development
npm run dev

# Clean build artifacts
npm run clean
```

The build creates two bundles:
- `dist/index.mjs` - ES Module (for modern bundlers)
- `dist/index.js` - CommonJS (for Node.js)

## Error Handling

Errors are handled by the OpenAI SDK and follow their error structure:

```javascript
try {
  const response = await opencard.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello!' }],
  });
} catch (error) {
  console.error('Error:', error.message);
  console.error('Status:', error.status);
  console.error('Type:', error.type);
}
```

See [OpenAI SDK Error Handling](https://github.com/openai/openai-node#error-handling) for details.

## TypeScript Support

TypeScript definitions are inherited from the OpenAI SDK:

```typescript
import OpenAI from 'openai';
import OpenCard from '@opencard/sdk';

const opencard = new OpenCard();

// Full type safety
const params: OpenAI.Chat.ChatCompletionCreateParams = {
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
};

const completion = await opencard.chat.completions.create(params);
```

## Multi-Provider Support

OpenCard routes to multiple AI providers. Use the `provider/model` format:

```javascript
// OpenAI
await opencard.chat.completions.create({
  model: 'openai/gpt-4o',
  messages: [...]
});

// Anthropic
await opencard.chat.completions.create({
  model: 'anthropic/claude-3-5-sonnet-20241022',
  messages: [...]
});

// Google
await opencard.chat.completions.create({
  model: 'google/gemini-2.0-flash-exp',
  messages: [...]
});

// xAI
await opencard.chat.completions.create({
  model: 'xai/grok-beta',
  messages: [...]
});

// And many more...
```

All calls deduct credits from the user's OpenCard balance automatically.

## Browser-Only Notice

This SDK is **browser-only**. It will throw an error if used in Node.js or other server environments:

```javascript
// ❌ Throws error in Node.js
const opencard = new OpenCard();
// Error: OpenCard SDK is currently only supported in browser environments.
```

For server-side usage, API key authentication is coming soon.

## Why OpenCard?

### For Your App
- ✅ **Zero LLM costs** - Users pay for their own usage
- ✅ **No billing code** - Stripe Checkout handled automatically
- ✅ **No API key management** - Session-based auth via cookies
- ✅ **Multi-provider access** - OpenAI, Anthropic, Google, xAI, and more

### For Your Users
- ✅ **One wallet for all AI** - No separate accounts per provider
- ✅ **Transparent pricing** - See exact costs per request
- ✅ **Top up as you go** - No subscriptions or commitments
- ✅ **Secure payments** - Powered by Stripe

### Technical Benefits
- ✅ **Minimal bundle size** - ~150 lines of custom code
- ✅ **Battle-tested** - Built on OpenAI SDK
- ✅ **OpenAI-compatible** - Works with existing tools
- ✅ **Vercel AI SDK support** - Use `streamText()` and more

## Examples

### Streaming Chat with React

```jsx
import { useOpenCard } from '@opencard/sdk';
import { useState } from 'react';

function StreamingChat() {
  const opencard = useOpenCard();
  const [content, setContent] = useState('');

  async function handleStream() {
    setContent('');

    const stream = await opencard.chat.completions.create({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'Write a haiku about code' }],
      stream: true
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      setContent(prev => prev + delta);
    }
  }

  return (
    <div>
      <button onClick={handleStream}>Generate Haiku</button>
      <pre>{content}</pre>
    </div>
  );
}
```

### Using with Vercel AI SDK

```typescript
import OpenCard from '@opencard/sdk';
import { streamText } from 'ai';
import { useState } from 'react';

function VercelAIChat() {
  const opencard = new OpenCard();
  const [content, setContent] = useState('');

  async function handleStream() {
    setContent('');

    const result = await streamText({
      model: opencard.provider('anthropic/claude-3-5-sonnet-20241022'),
      messages: [{ role: 'user', content: 'Write a haiku about code' }]
    });

    for await (const chunk of result.textStream) {
      setContent(prev => prev + chunk);
    }
  }

  return (
    <div>
      <button onClick={handleStream}>Generate Haiku</button>
      <pre>{content}</pre>
    </div>
  );
}
```

## License

MIT

## Documentation

- **Quickstart Guide**: [https://docs.opencard.ai/quickstart](https://docs.opencard.ai/quickstart)
- **API Reference**: [https://docs.opencard.ai/api](https://docs.opencard.ai/api)
- **Examples**: [https://docs.opencard.ai/examples](https://docs.opencard.ai/examples)

## Support

- **GitHub Issues**: [https://github.com/opencard/opencard-sdk/issues](https://github.com/opencard/opencard-sdk/issues)
- **Email**: support@opencard.ai
- **Discord**: [Join our community](https://discord.gg/opencard)
