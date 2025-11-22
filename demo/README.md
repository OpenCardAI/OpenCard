# OpenCard SDK Demo

Ultraminimalist browser-based demos showing the full SDK → API → Proxy → OpenAI flow.

## Demo Files

- **`index.html`** - Main demo with streaming test
- **`migration-example.html`** - Drop-in replacement pattern using `OpenAI` alias

## Prerequisites

1. **opencard-api** running on `http://localhost:3000`
2. **opencard-proxy** running on `http://localhost:4000`
3. SDK built: `npm run build` (in opencard-sdk root)

## Run Demo

```bash
npm run demo
```

Then open:
- Main demo: `http://localhost:8080/demo/`
- Migration example: `http://localhost:8080/demo/migration-example.html`

## What It Tests

### "Test SDK" Button (Non-streaming)
1. SDK makes request to `http://localhost:3000/v1/chat/completions`
2. API validates test API key: `sk-opencard-test-dev-1234567890`
3. API checks test user has credits ($10.00 balance)
4. API proxies to LiteLLM on port 4000
5. LiteLLM routes to OpenAI
6. Full JSON response appears at once

### "Test Streaming" Button (Real-time streaming)
1. SDK makes streaming request with `stream: true`
2. Same auth + credit validation flow
3. API streams Server-Sent Events (SSE) through proxy
4. Tokens appear in real-time as OpenAI generates them
5. Demonstrates full streaming support through entire platform

## Full Flow

```
Browser (demo/index.html)
  ↓ OpenCard SDK (../dist/index.mjs)
  ↓ HTTP POST localhost:3000/v1/chat/completions
opencard-api:3000
  ↓ authenticate() validates sk-opencard-test-dev-1234567890
  ↓ creditService.getBalance() returns $10.00
  ↓ replaces Authorization with LITELLM_MASTER_KEY
  ↓ HTTP POST localhost:4000/v1/chat/completions
opencard-proxy:4000
  ↓ routes to OpenAI
  ← completion returns
Browser displays JSON response
```

## No Styling

This is an ultraminimalist test - zero CSS, just functionality.
