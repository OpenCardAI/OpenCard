import React, { useState } from 'react';
import { OpenCardProvider, AuthButton, useOpenCard } from '@opencard/sdk';

function DemoContent() {
  const { client, isAuthenticated, isAuthenticating, user } = useOpenCard();
  const [modelResponse, setModelResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCallModel = async () => {
    if (!client) {
      setModelResponse('Error: OpenAI client not available. Make sure you have the openai package installed.');
      return;
    }

    try {
      setLoading(true);
      setModelResponse('');
      
      // This is the standard OpenAI SDK call, but routed through OpenCard
      const response = await client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello, this is a test message from OpenCard SDK!' }
        ]
      });
      
      setModelResponse(JSON.stringify(response, null, 2));
    } catch (error) {
      setModelResponse(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>OpenCard SDK Demo</h1>
      
      <div>
        <h2>Authentication</h2>
        <AuthButton />
        
        <div>
          <p><strong>Status:</strong> {isAuthenticating ? 'Signing in...' : isAuthenticated ? 'Authenticated' : 'Not signed in'}</p>
        </div>
      </div>

      {isAuthenticated && (
        <>
          <div>
            <h2>User Info</h2>
            <pre>
              {user ? JSON.stringify(user, null, 2) : 'No user data'}
            </pre>
          </div>

          <div>
            <h2>OpenAI Client</h2>
            <p>Client available: {client ? 'Yes' : 'No (install openai package)'}</p>
          </div>

          {client && (
            <div>
              <h2>Test OpenAI API Call</h2>
              <p>This uses the standard OpenAI SDK, but authenticated through OpenCard:</p>
              <button 
                onClick={handleCallModel}
                disabled={loading}
              >
                {loading ? 'Calling Model...' : 'Call client.chat.completions.create()'}
              </button>
              {modelResponse && (
                <pre>
                  {modelResponse}
                </pre>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function App() {
  const config = {
    clientId: 'demo-client-id',
    redirectUri: window.location.origin,
  };

  return (
    <OpenCardProvider config={config}>
      <DemoContent />
    </OpenCardProvider>
  );
}

export default App;