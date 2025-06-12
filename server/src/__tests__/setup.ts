// Test setup file
import 'module-alias/register';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.TWILIO_ACCOUNT_SID = 'test_account_sid';
process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
process.env.TWILIO_PHONE_NUMBER = '+1234567890';
process.env.OPENAI_API_KEY = 'sk-demo-key-for-testing';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.WEBHOOK_BASE_URL = 'https://test.ngrok.io';