import React, { useState } from 'react';
import { OpenCardProvider, AuthButton, useOpenCard } from '@opencard/sdk';

function DemoContent() {
  const { client, isAuthenticated, isAuthenticating, user, opencardClient } = useOpenCard();
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
          <p><strong>Status:</strong> {isAuthenticating ? 'Signing in...' : isAuthenticated ? '✅ Authenticated' : '❌ Not signed in'}</p>

          {isAuthenticated && user && (
            <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#e8f5e8', border: '1px solid #4caf50', borderRadius: '4px' }}>
              <strong>👋 Welcome back!</strong>
              <p><strong>Email:</strong> {user.email || 'Not available'}</p>
              <p><strong>User ID:</strong> {user.sub || 'Not available'}</p>
            </div>
          )}

          {opencardClient && (
            <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px', fontSize: '12px' }}>
              <strong>Environment Info:</strong>
              <pre>{JSON.stringify(opencardClient.getEnvironmentInfo(), null, 2)}</pre>
            </div>
          )}
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
    clientId: 'opencard', // Base app ID - SDK automatically resolves to client_dev or client_prod
    authUrl: 'http://localhost:3000', // Local auth service (only needed for local dev)
    // redirectUri defaults to window.location.origin for plug-and-play usage
    // environment is auto-detected based on hostname/port
  };

  return (
    <OpenCardProvider config={config}>
      <DemoContent />
    </OpenCardProvider>
  );
}

export default App;