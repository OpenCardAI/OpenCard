# OpenCard SDK

Universal AI wallet SDK for JavaScript and React. A thin wrapper around the OpenAI SDK that points to OpenCard's API for credit-based billing across multiple AI providers.

## Features

- ✅ **OpenAI-compatible API** - Drop-in replacement for OpenAI SDK
- ✅ **Multi-provider access** - GPT-4, Claude, Gemini, Llama, and more through one API
- ✅ **Credit-based billing** - Pay once, use across all models
- ✅ **Zero custom code** - Built on battle-tested OpenAI SDK
- ✅ **Full streaming support** - Async generators for real-time responses
- ✅ **TypeScript ready** - Inherits OpenAI SDK type definitions

## Installation

```bash
npm install @opencard/sdk
```

## Quick Start

### Vanilla JavaScript

```javascript
import { OpenCard } from '@opencard/sdk';

const opencard = new OpenCard({
  apiKey: 'sk-opencard-...'
});

const response = await opencard.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(response.choices[0].message.content);
```

### React

```jsx
import { OpenCardProvider, useOpenCard } from '@opencard/sdk';

function App() {
  return (
    <OpenCardProvider apiKey="sk-opencard-...">
      <ChatComponent />
    </OpenCardProvider>
  );
}

function ChatComponent() {
  const opencard = useOpenCard();

  const handleChat = async () => {
    const response = await opencard.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello!' }],
    });
    console.log(response.choices[0].message.content);
  };

  return <button onClick={handleChat}>Send Message</button>;
}
```

## How It Works

OpenCard SDK extends the official OpenAI SDK and points it to `https://api.opencard.ai/v1` instead of `https://api.openai.com/v1`. Everything else—streaming, error handling, retries, TypeScript definitions—comes from the OpenAI SDK.

```javascript
// Essentially this:
class OpenCard extends OpenAI {
  constructor({ apiKey, ...options }) {
    super({
      apiKey,
      baseURL: 'https://api.opencard.ai/v1',
      ...options
    });
  }
}
```

This means you can use **any OpenAI SDK feature** and it just works.

## API Reference

### Constructor Options

```javascript
const opencard = new OpenCard({
  apiKey: 'sk-opencard-...',              // Required: Your OpenCard API key
  baseURL: 'https://api.opencard.ai/v1',  // Optional: Custom endpoint (for local dev)
  timeout: 30000,                         // Optional: Request timeout (ms)
  maxRetries: 3,                          // Optional: Max retry attempts
});
```

All OpenAI SDK constructor options are supported.

### Chat Completions

OpenAI-compatible chat API with streaming support:

```javascript
// Non-streaming
const response = await opencard.chat.completions.create({
  model: 'gpt-4',
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
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Write a story about a robot.' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

### Embeddings

```javascript
const response = await opencard.embeddings.create({
  model: 'text-embedding-ada-002',
  input: 'The quick brown fox jumps over the lazy dog.',
});

console.log(response.data[0].embedding); // Array of floats
```

### Models

```javascript
const models = await opencard.models.list();
console.log(models.data); // List of available models
```

## React Hooks

### OpenCardProvider

Wraps your app and provides the OpenCard client to all child components:

```jsx
import { OpenCardProvider } from '@opencard/sdk';

function App() {
  return (
    <OpenCardProvider
      apiKey="sk-opencard-..."
      baseURL="http://localhost:3000/v1"  // Optional: for local development
    >
      <YourApp />
    </OpenCardProvider>
  );
}
```

You can pass any OpenAI SDK constructor options as props.

### useOpenCard Hook

Access the OpenCard client instance in any component:

```jsx
import { useOpenCard } from '@opencard/sdk';

function MyComponent() {
  const opencard = useOpenCard();

  // Use exactly like OpenAI SDK
  const response = await opencard.chat.completions.create({
    model: 'claude-3-5-sonnet-20241022',
    messages: [{ role: 'user', content: 'Hello Claude!' }]
  });

  return <div>{response.choices[0].message.content}</div>;
}
```

## Environment Variables

The SDK checks environment variables for configuration (useful for local development):

```bash
# Option 1: Node.js / server-side
OPENCARD_API_BASE=http://localhost:3000/v1

# Option 2: Next.js / client-side (must start with NEXT_PUBLIC_)
NEXT_PUBLIC_OPENCARD_API_BASE=http://localhost:3000/v1
```

Priority order:
1. Explicit `baseURL` in constructor (highest)
2. `OPENCARD_API_BASE` environment variable
3. `NEXT_PUBLIC_OPENCARD_API_BASE` environment variable
4. `https://api.opencard.ai/v1` (default)

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
import { OpenCard } from '@opencard/sdk';

const opencard = new OpenCard({
  apiKey: process.env.OPENCARD_API_KEY!
});

// Full type safety
const params: OpenAI.Chat.ChatCompletionCreateParams = {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }],
};

const completion = await opencard.chat.completions.create(params);
```

## Multi-Provider Support

OpenCard routes to multiple AI providers through LiteLLM. Use model names directly:

```javascript
// OpenAI
await opencard.chat.completions.create({ model: 'gpt-4', ... });

// Anthropic
await opencard.chat.completions.create({ model: 'claude-3-5-sonnet-20241022', ... });

// Google
await opencard.chat.completions.create({ model: 'gemini-2.0-flash-exp', ... });

// xAI
await opencard.chat.completions.create({ model: 'grok-beta', ... });

// And many more...
```

All calls deduct credits from your OpenCard balance automatically.

## Local Development

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

## Why OpenCard SDK?

### vs. OpenAI SDK
- ✅ Same API, zero learning curve
- ✅ Access to 100+ models beyond OpenAI (Claude, Gemini, Llama, etc.)
- ✅ Unified billing across all providers
- ✅ Credit-based pricing (no separate API keys/accounts)

### vs. LangChain / Other SDKs
- ✅ No abstraction layer - direct OpenAI-compatible API
- ✅ Minimal bundle size (~2KB custom code + OpenAI SDK)
- ✅ Battle-tested OpenAI SDK under the hood
- ✅ Simple: just change baseURL, everything else is standard

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
      model: 'gpt-4',
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

### Server-Side API Route (Next.js)

```typescript
// app/api/chat/route.ts
import { OpenCard } from '@opencard/sdk';
import { NextResponse } from 'next/server';

const opencard = new OpenCard({
  apiKey: process.env.OPENCARD_API_KEY!
});

export async function POST(req: Request) {
  const { message } = await req.json();

  const response = await opencard.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: message }]
  });

  return NextResponse.json(response);
}
```

## License

MIT

## Support

- Documentation: [https://docs.opencard.ai](https://docs.opencard.ai)
- GitHub Issues: [https://github.com/opencard/opencard-sdk/issues](https://github.com/opencard/opencard-sdk/issues)
- Email: support@opencard.ai
