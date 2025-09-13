import React, { useState } from 'react';
import { OpenCardProvider, ConnectButton, useOpenCard } from '@opencard/sdk';

function DemoContent() {
  const { connected, connecting, profile, session, callModel } = useOpenCard();
  const [modelResponse, setModelResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCallModel = async () => {
    try {
      setLoading(true);
      setModelResponse('');
      const response = await callModel({
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello, this is a test!' }
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
    <div className="demo-content">
      <h1>OpenCard SDK Demo</h1>
      
      <div className="card">
        <h2>Authentication</h2>
        <ConnectButton className="connect-btn" />
        
        <div className="status">
          <p><strong>Status:</strong> {connecting ? 'Connecting...' : connected ? 'Connected' : 'Not connected'}</p>
        </div>
      </div>

      {connected && (
        <>
          <div className="card">
            <h2>User Profile</h2>
            <pre className="code-block">
              {profile ? JSON.stringify(profile, null, 2) : 'No profile data'}
            </pre>
          </div>

          <div className="card">
            <h2>Session Info</h2>
            <pre className="code-block">
              {session ? JSON.stringify(session, null, 2) : 'No session data'}
            </pre>
          </div>

          <div className="card">
            <h2>Test Model Call</h2>
            <button 
              onClick={handleCallModel}
              disabled={loading}
              className="action-btn"
            >
              {loading ? 'Calling Model...' : 'Call Test Model'}
            </button>
            {modelResponse && (
              <pre className="code-block">
                {modelResponse}
              </pre>
            )}
          </div>
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