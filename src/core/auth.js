import * as oauth from 'oauth4webapi';

export function generateCodeVerifier() {
  return oauth.generateRandomCodeVerifier();
}

export function generateCodeChallenge(verifier) {
  return oauth.calculatePKCECodeChallenge(verifier);
}

export function generateState() {
  return oauth.generateRandomState();
}

export function buildAuthUrl(params) {
  const authorizationServer = {
    issuer: params.authUrl,
    authorization_endpoint: `${params.authUrl}/oauth/authorize`,
  };

  const client = {
    client_id: params.clientId,
  };

  const authUrl = new URL(authorizationServer.authorization_endpoint);
  authUrl.searchParams.set('client_id', client.client_id);
  authUrl.searchParams.set('redirect_uri', params.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', params.scope || 'openid profile');
  authUrl.searchParams.set('state', params.state);
  authUrl.searchParams.set('code_challenge', params.codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return authUrl.toString();
}

export async function exchangeCodeForTokens(params) {
  const authorizationServer = {
    issuer: params.authUrl,
    token_endpoint: `${params.authUrl}/oauth/token`,
  };

  const client = {
    client_id: params.clientId,
  };

  // Create URLSearchParams that oauth4webapi expects
  const callbackParams = new URLSearchParams();
  callbackParams.set('code', params.code);

  const response = await oauth.authorizationCodeGrantRequest(
    authorizationServer,
    client,
    callbackParams,
    params.redirectUri,
    params.codeVerifier
  );

  // Parse the response
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(`OAuth error: ${result.error} - ${result.error_description}`);
  }

  return {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_in: result.expires_in,
    token_type: result.token_type,
  };
}