export class OpenCardClient {
  constructor(config = {}) {
    this.session = null;
    this.config = {
      authUrl: config.authUrl || 'https://auth.opencard.ai',
      apiUrl: config.apiUrl || 'https://api.opencard.ai',
      clientId: config.clientId || '',
      redirectUri: config.redirectUri || (typeof window !== 'undefined' ? window.location.origin : ''),
    };
  }

  async connect() {
    // TODO: Implement OAuth flow
    throw new Error('Not implemented');
  }

  async disconnect() {
    // TODO: Clear session and revoke tokens
    this.session = null;
  }

  getSession() {
    return this.session;
  }

  async getProfile() {
    // TODO: Fetch user profile from API
    if (!this.session) return null;
    throw new Error('Not implemented');
  }

  async callModel(options) {
    // TODO: Call AI model through OpenCard API
    if (!this.session) {
      throw new Error('Not connected');
    }
    throw new Error('Not implemented');
  }

  isConnected() {
    return !!this.session;
  }
}