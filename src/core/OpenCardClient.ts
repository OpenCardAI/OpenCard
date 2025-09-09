import type { Session, Profile, ModelCallOptions, ModelResponse, OpenCardConfig } from '../types';

export class OpenCardClient {
  private config: Required<OpenCardConfig>;
  private session: Session | null = null;

  constructor(config: OpenCardConfig = {}) {
    this.config = {
      authUrl: config.authUrl || 'https://auth.opencard.ai',
      apiUrl: config.apiUrl || 'https://api.opencard.ai',
      clientId: config.clientId || '',
      redirectUri: config.redirectUri || window.location.origin,
    };
  }

  async connect(): Promise<Session> {
    // TODO: Implement OAuth flow
    throw new Error('Not implemented');
  }

  async disconnect(): Promise<void> {
    // TODO: Clear session and revoke tokens
    this.session = null;
  }

  getSession(): Session | null {
    return this.session;
  }

  async getProfile(): Promise<Profile | null> {
    // TODO: Fetch user profile from API
    if (!this.session) return null;
    throw new Error('Not implemented');
  }

  async callModel(options: ModelCallOptions): Promise<ModelResponse> {
    // TODO: Call AI model through OpenCard API
    if (!this.session) {
      throw new Error('Not connected');
    }
    throw new Error('Not implemented');
  }

  isConnected(): boolean {
    return !!this.session;
  }
}