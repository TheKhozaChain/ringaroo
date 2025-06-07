import { config } from 'dotenv';
import { z } from 'zod';
import type { AppConfig } from '@/types';

// Load environment variables
config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
  
  // Database (optional for development)
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  
  // Twilio
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: z.string().min(1),
  
  // OpenAI
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  
  // TTS Options
  AZURE_SPEECH_KEY: z.string().optional(),
  AZURE_SPEECH_REGION: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  
  // Security
  JWT_SECRET: z.string().min(32),
  
  // Application
  WEBHOOK_BASE_URL: z.string().url(),
  MAX_CONCURRENT_CALLS: z.string().transform(Number).default('10'),
  DIALOGUE_TIMEOUT_MS: z.string().transform(Number).default('30000'),
  ASR_CONFIDENCE_THRESHOLD: z.string().transform(Number).default('0.7'),
});

const envVars = envSchema.parse(process.env);

export const appConfig: AppConfig = {
  nodeEnv: envVars.NODE_ENV,
  port: envVars.PORT,
  logLevel: envVars.LOG_LEVEL,
  databaseUrl: envVars.DATABASE_URL || 'postgresql://siphokhoza@localhost:5432/ringaroo',
  redisUrl: envVars.REDIS_URL || 'redis://localhost:6379',
  twilioAccountSid: envVars.TWILIO_ACCOUNT_SID,
  twilioAuthToken: envVars.TWILIO_AUTH_TOKEN,
  twilioPhoneNumber: envVars.TWILIO_PHONE_NUMBER,
  openaiApiKey: envVars.OPENAI_API_KEY,
  openaiModel: envVars.OPENAI_MODEL,
  openaiEmbeddingModel: envVars.OPENAI_EMBEDDING_MODEL,
  azureSpeechKey: envVars.AZURE_SPEECH_KEY,
  azureSpeechRegion: envVars.AZURE_SPEECH_REGION,
  elevenlabsApiKey: envVars.ELEVENLABS_API_KEY,
  elevenlabsVoiceId: envVars.ELEVENLABS_VOICE_ID,
  jwtSecret: envVars.JWT_SECRET,
  webhookBaseUrl: envVars.WEBHOOK_BASE_URL,
  maxConcurrentCalls: envVars.MAX_CONCURRENT_CALLS,
  dialogueTimeoutMs: envVars.DIALOGUE_TIMEOUT_MS,
  asrConfidenceThreshold: envVars.ASR_CONFIDENCE_THRESHOLD,
};

export default appConfig; 