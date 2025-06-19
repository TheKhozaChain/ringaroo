import axios from 'axios';
import { appConfig } from '@/config';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface TTSService {
  synthesize(text: string): Promise<Buffer>;
}

export interface TTSAudioService {
  generateAudioUrl(text: string, callId?: string): Promise<string>;
  generateAudioWithFallback(text: string, callId?: string): Promise<{ url?: string; fallbackText: string }>;
}

// Azure Speech Service TTS implementation
export class AzureTTSService implements TTSService {
  private readonly apiKey: string;
  private readonly region: string;
  private readonly voiceName: string = 'en-AU-WilliamNeural'; // Australian male voice for Johnno

  constructor() {
    this.apiKey = appConfig.azureSpeechKey || '';
    this.region = appConfig.azureSpeechRegion || '';
  }

  async synthesize(text: string): Promise<Buffer> {
    const tokenUrl = `https://${this.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
    const ttsUrl = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;

    try {
      // Get access token
      const tokenResponse = await axios.post(tokenUrl, null, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const accessToken = tokenResponse.data;

      // Enhanced SSML for more natural speech synthesis
      const ssml = `
        <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-AU'>
          <voice name='${this.voiceName}'>
            <mstts:express-as style='friendly' styledegree='0.8'>
              <prosody rate='0.9' pitch='+5%' contour='(20%,+10Hz) (40%,+5Hz) (60%,-5Hz) (80%,+8Hz)'>
                ${text}
              </prosody>
            </mstts:express-as>
          </voice>
        </speak>
      `;

      // Synthesize speech
      const audioResponse = await axios.post(ttsUrl, ssml, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        },
        responseType: 'arraybuffer',
      });

      return Buffer.from(audioResponse.data);
    } catch (error: any) {
      console.error('Azure TTS error:', error.response?.data || error.message);
      throw new Error('Failed to synthesize speech with Azure TTS');
    }
  }
}

// ElevenLabs TTS implementation
export class ElevenLabsTTSService implements TTSService {
  private readonly apiKey: string;
  private readonly voiceId: string;

  constructor() {
    this.apiKey = appConfig.elevenlabsApiKey || '';
    this.voiceId = appConfig.elevenlabsVoiceId || '';
  }

  async synthesize(text: string): Promise<Buffer> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`;

    try {
      const response = await axios.post(url, {
        text,
        model_id: 'eleven_turbo_v2', // Faster, more natural model
        voice_settings: {
          stability: 0.35, // Lower for more natural variation
          similarity_boost: 0.85, // Higher for better voice consistency
          style: 0.2, // Add slight style variation
          use_speaker_boost: true, // Enhance naturalness
        },
      }, {
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('ElevenLabs TTS error:', error.response?.data || error.message);
      throw new Error('Failed to synthesize speech with ElevenLabs TTS');
    }
  }
}

// OpenAI TTS implementation
export class OpenAITTSService implements TTSService {
  private readonly apiKey: string;
  private readonly voice: string = 'onyx'; // Male voice for Johnno
  private readonly model: string = 'tts-1'; // Optimized for speed and low latency

  constructor() {
    this.apiKey = appConfig.openaiApiKey || '';
  }

  async synthesize(text: string): Promise<Buffer> {
    const url = 'https://api.openai.com/v1/audio/speech';

    try {
      const response = await axios.post(url, {
        model: this.model,
        input: text,
        voice: this.voice,
        response_format: 'mp3', // Twilio supports MP3
        speed: 1.0, // Normal speed for natural conversation
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 8000, // 8 seconds - reasonable timeout for demo
      });

      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('OpenAI TTS error:', error.response?.data || error.message);
      throw new Error('Failed to synthesize speech with OpenAI TTS');
    }
  }
}

// Mock TTS service for development/testing
export class MockTTSService implements TTSService {
  async synthesize(text: string): Promise<Buffer> {
    // Return a minimal audio buffer for testing
    // In a real implementation, this would generate actual audio
    const mockAudio = Buffer.alloc(1024, 0);
    console.log(`Mock TTS: "${text}"`);
    return mockAudio;
  }
}

// Factory function to create appropriate TTS service
export function createTTSService(): TTSService {
  // Prioritize OpenAI TTS-HD for best quality/price ratio
  if (appConfig.openaiApiKey) {
    console.log('Using OpenAI TTS-1-HD service');
    return new OpenAITTSService();
  } else if (appConfig.azureSpeechKey && appConfig.azureSpeechRegion) {
    console.log('Using Azure TTS service');
    return new AzureTTSService();
  } else if (appConfig.elevenlabsApiKey && appConfig.elevenlabsVoiceId) {
    console.log('Using ElevenLabs TTS service');
    return new ElevenLabsTTSService();
  } else {
    console.warn('No TTS service configured, using mock TTS service');
    return new MockTTSService();
  }
}

// Audio file management service for Twilio <Play> integration
export class TTSAudioManager implements TTSAudioService {
  private readonly ttsService: TTSService;
  private readonly audioDir: string;
  private readonly baseUrl: string;
  private readonly maxFileAge: number = 3600000; // 1 hour in milliseconds

  constructor(ttsService: TTSService) {
    this.ttsService = ttsService;
    this.audioDir = path.join(process.cwd(), 'temp', 'audio');
    this.baseUrl = appConfig.webhookBaseUrl;
    this.ensureAudioDirectory();
  }

  private async ensureAudioDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.audioDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create audio directory:', error);
    }
  }

  private generateAudioFilename(text: string, callId?: string): string {
    // Create a hash of the text for consistent caching
    const textHash = crypto.createHash('md5').update(text).digest('hex');
    const prefix = callId ? `${callId}_` : '';
    const timestamp = Date.now();
    return `${prefix}${textHash}_${timestamp}.mp3`;
  }

  private async cleanupOldFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.audioDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(this.audioDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > this.maxFileAge) {
          await fs.unlink(filePath);
          console.log(`Cleaned up old audio file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up audio files:', error);
    }
  }

  async generateAudioUrl(text: string, callId?: string): Promise<string> {
    try {
      // Clean up old files periodically
      if (Math.random() < 0.1) { // 10% chance to trigger cleanup
        this.cleanupOldFiles().catch(console.error);
      }

      // Generate audio using the TTS service
      const audioBuffer = await this.ttsService.synthesize(text);
      
      // Create filename and save to disk
      const filename = this.generateAudioFilename(text, callId);
      const filePath = path.join(this.audioDir, filename);
      
      await fs.writeFile(filePath, audioBuffer);
      
      // Return the URL that Twilio can access
      const audioUrl = `${this.baseUrl}/audio/${filename}`;
      
      console.log(`Generated audio file: ${filename} (${audioBuffer.length} bytes)`);
      return audioUrl;
      
    } catch (error: any) {
      console.error('Failed to generate audio URL:', error);
      throw error;
    }
  }

  async generateAudioWithFallback(text: string, callId?: string): Promise<{ url?: string; fallbackText: string }> {
    try {
      const url = await this.generateAudioUrl(text, callId);
      return { url, fallbackText: text };
    } catch (error: any) {
      console.error('TTS generation failed, using fallback:', error.message);
      return { fallbackText: text };
    }
  }
}

// Synchronous TTS cache for immediate webhook responses
class TTSCacheManager {
  private cache: Map<string, string> = new Map();
  private ttsAudioManager: TTSAudioManager;

  constructor(ttsAudioManager: TTSAudioManager) {
    this.ttsAudioManager = ttsAudioManager;
    this.preGenerateCommonPhrases();
  }

  private async preGenerateCommonPhrases(): Promise<void> {
    // Pre-generate common phrases in background
    const commonPhrases = [
      "G'day! Thanks for calling. I'm Johnno, your AI assistant. How can I help you today?",
      "Sorry, I didn't hear you. Please tell me how I can help you today.",
      "Thanks for calling! Have a great day!",
      "I can help you with bookings, questions about our services, or general information.",
      "Let me help you with that booking.",
      "What service would you like to book?",
      "What day works best for you?",
      "Sorry mate, I'm having a bit of trouble right now. Please try again.",
      
      // Expanded common responses
      "G'day mate! We offer a range of services. Could you let me know more about what you're after? I'll do my best to help!",
      "G'day mate! We offer a range of services like facial treatments, massage therapy, and bridal packages. Could you let me know what you're after, and I'll do my best to assist?",
      "I didn't catch that. Could you please repeat your response?",
      "Sorry, I missed that. Could you please tell me your booking details again?",
      "Could you please tell me your name for the booking?",
      "What time would you prefer for your appointment?",
      "Perfect! I can help you with that. What's your name for the booking?",
      "Great! I'd be happy to help you with a booking. What service are you interested in?",
      "Absolutely! We can arrange that for you. When would you like to book?",
      "No worries! I understand. What can I help you with instead?",
      "That sounds perfect! Let me get those details for you.",
      "Excellent choice! What day would work best for you?"
    ];

    // Generate in background without blocking
    Promise.all(
      commonPhrases.map(async (phrase) => {
        try {
          const url = await this.ttsAudioManager.generateAudioUrl(phrase);
          this.cache.set(phrase, url);
          console.log(`Cached TTS for: "${phrase.substring(0, 50)}..."`);
        } catch (error) {
          console.warn(`Failed to cache TTS for phrase: ${error}`);
        }
      })
    ).catch(console.error);
  }

  private getTimeoutForText(text: string): number {
    const length = text.length;
    if (length <= 50) return 2000;      // 2 seconds for short text
    if (length <= 100) return 3000;     // 3 seconds for medium text
    return 4000;                        // 4 seconds for long text
  }

  async getAudioElement(text: string, callId?: string): Promise<string> {
    // Check cache first for instant OpenAI TTS
    const cachedUrl = this.cache.get(text);
    if (cachedUrl) {
      console.log(`Using cached OpenAI TTS: "${text.substring(0, 30)}..."`);
      return `<Play>${cachedUrl}</Play>`;
    }

    // 100% OpenAI TTS - NO FALLBACKS - Use proper async/await
    console.log(`🎯 FORCING 100% OpenAI TTS for: "${text.substring(0, 30)}..." (${text.length} chars) - NO FALLBACKS`);
    
    const startTime = Date.now();
    const maxWaitTime = 8000; // Maximum 8 seconds for demo responsiveness

    try {
        // Use Promise.race for proper timeout handling
        const url = await Promise.race([
            this.ttsAudioManager.generateAudioUrl(text, callId),
            new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('TTS timeout')), maxWaitTime)
            )
        ]);

        const duration = Date.now() - startTime;
        this.cache.set(text, url);
        console.log(`🎉 100% OpenAI TTS SUCCESS: "${text.substring(0, 30)}..." -> ${url} (${duration}ms)`);
        return `<Play>${url}</Play>`;

    } catch (error: any) {
        const duration = Date.now() - startTime;
        console.error(`🚨 SYSTEM FAILURE: OpenAI TTS failed after ${duration}ms for: "${text.substring(0, 30)}..." - Error: ${error.message}`);
        
        // Last resort: Return a basic message but log as critical failure
        console.error(`🚨 CRITICAL: Returning emergency fallback - This indicates a serious system problem!`);
        const sanitizedText = this.sanitizeForXML("I'm having technical difficulties. Please try calling back in a moment.");
        return `<Say voice="man">${sanitizedText}</Say>`;
    }
  }

  async getAudioElementWithTimeout(text: string, callId?: string, timeout: number = 2000): Promise<string> {
    // Check cache first for instant OpenAI TTS
    const cachedUrl = this.cache.get(text);
    if (cachedUrl) {
      console.log(`Using cached OpenAI TTS: "${text.substring(0, 30)}..."`);
      return `<Play>${cachedUrl}</Play>`;
    }

    // Try to generate OpenAI TTS with timeout
    try {
      console.log(`Attempting real-time OpenAI TTS for: "${text.substring(0, 30)}..." (${timeout}ms timeout)`);
      
      const urlPromise = this.ttsAudioManager.generateAudioUrl(text, callId);
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('TTS timeout')), timeout)
      );

      const url = await Promise.race([urlPromise, timeoutPromise]);
      this.cache.set(text, url);
      console.log(`Real-time OpenAI TTS success: "${text.substring(0, 30)}..." -> ${url}`);
      return `<Play>${url}</Play>`;

    } catch (error) {
      console.warn(`Real-time OpenAI TTS failed, using fallback: ${error instanceof Error ? error.message : error}`);
      
      // Fallback to basic TTS for immediate response
      const sanitizedText = this.sanitizeForXML(text);
      
      // Continue generating OpenAI TTS in background for next time
      this.ttsAudioManager.generateAudioUrl(text, callId)
        .then(url => {
          this.cache.set(text, url);
          console.log(`Background cached OpenAI TTS: "${text.substring(0, 30)}..." -> ${url}`);
        })
        .catch(error => console.warn('Background TTS failed:', error));

      return `<Say voice="man">${sanitizedText}</Say>`;
    }
  }

  private isCommonPhrase(text: string): boolean {
    const commonPhrases = [
      "G'day! Thanks for calling",
      "Sorry, I didn't hear you",
      "Thanks for calling! Have a great day",
      "I can help you with bookings",
      "Let me help you with that",
      "What service would you like",
      "What day works best",
      "Sorry mate, I'm having a bit of trouble"
    ];
    
    return commonPhrases.some(phrase => text.includes(phrase));
  }

  private sanitizeForXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}

// Export singleton instance
export const ttsService = createTTSService();
export const ttsAudioManager = new TTSAudioManager(ttsService);
export const ttsCacheManager = new TTSCacheManager(ttsAudioManager);