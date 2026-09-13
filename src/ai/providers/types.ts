export type AIRequestType =
  | 'simple_request'
  | 'medical_request'
  | 'document_request'
  | 'image_request';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIImagePart {
  mimeType: string;
  data: Buffer | string; // Buffer or Base64 string
}

export interface AIRequest {
  requestType: AIRequestType;
  prompt: string;
  systemInstruction?: string;
  history?: AIMessage[];
  images?: AIImagePart[];
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface AITokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
  tokensUsed?: AITokenUsage;
  latencyMs: number;
}

export interface AIProviderError {
  provider: string;
  isTransient: boolean;
  isRateLimit: boolean;
  isAuthError: boolean;
  statusCode?: number;
  message: string;
  originalError?: unknown;
}

export interface AIProvider {
  readonly name: string;
  readonly defaultModel: string;
  generateText(input: AIRequest): Promise<AIResponse>;
  generateVision?(input: AIRequest): Promise<AIResponse>;
  isAvailable(): Promise<boolean>;
}
