export interface Profile {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

export interface Session {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  profile?: Profile;
}

export interface ModelCallOptions {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ModelResponse {
  id: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finishReason?: string;
  }>;
}

export interface OpenCardConfig {
  authUrl?: string;
  apiUrl?: string;
  clientId?: string;
  redirectUri?: string;
}

export interface OpenCardContextValue {
  connected: boolean;
  connecting: boolean;
  profile?: Profile;
  session?: Session;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  callModel: (options: ModelCallOptions) => Promise<ModelResponse>;
}