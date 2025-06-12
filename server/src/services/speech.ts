import OpenAI from 'openai';
import { appConfig } from '@/config';

export interface SpeechRecognitionResult {
  text: string;
  confidence: number;
  language?: string;
}

export interface SpeechRecognitionService {
  transcribe(audioBuffer: Buffer, format: AudioFormat): Promise<SpeechRecognitionResult>;
}

export enum AudioFormat {
  MULAW_8KHZ = 'mulaw',
  WAV_16KHZ = 'wav',
  MP3 = 'mp3',
  WEBM = 'webm',
}

export class WhisperSpeechService implements SpeechRecognitionService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: appConfig.openaiApiKey,
    });
  }

  async transcribe(audioBuffer: Buffer, format: AudioFormat): Promise<SpeechRecognitionResult> {
    try {
      // Convert μ-law to WAV format if needed
      const processedBuffer = format === AudioFormat.MULAW_8KHZ 
        ? this.convertMulawToWav(audioBuffer)
        : audioBuffer;

      // Create a File-like object for the Whisper API
      const audioFile = new File([processedBuffer], 'audio.wav', {
        type: 'audio/wav',
      });

      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'en', // Focus on English for Australian market
        response_format: 'verbose_json',
        temperature: 0.2, // Lower temperature for more consistent results
      });

      // Extract confidence from the response (if available)
      const confidence = this.calculateConfidence(transcription);

      return {
        text: transcription.text.trim(),
        confidence,
        language: transcription.language,
      };
    } catch (error: any) {
      console.error('Whisper transcription error:', error);
      
      // Return low confidence result to trigger fallback
      return {
        text: '',
        confidence: 0.0,
      };
    }
  }

  /**
   * Convert μ-law encoded audio to WAV format
   * Twilio sends audio as μ-law encoded, base64 encoded payload
   */
  private convertMulawToWav(mulawBuffer: Buffer): Buffer {
    // μ-law to linear PCM conversion table
    const MULAW_TO_LINEAR = [
      -32124,-31100,-30076,-29052,-28028,-27004,-25980,-24956,
      -23932,-22908,-21884,-20860,-19836,-18812,-17788,-16764,
      -15996,-15484,-14972,-14460,-13948,-13436,-12924,-12412,
      -11900,-11388,-10876,-10364,-9852,-9340,-8828,-8316,
      -7932,-7676,-7420,-7164,-6908,-6652,-6396,-6140,
      -5884,-5628,-5372,-5116,-4860,-4604,-4348,-4092,
      -3900,-3772,-3644,-3516,-3388,-3260,-3132,-3004,
      -2876,-2748,-2620,-2492,-2364,-2236,-2108,-1980,
      -1884,-1820,-1756,-1692,-1628,-1564,-1500,-1436,
      -1372,-1308,-1244,-1180,-1116,-1052,-988,-924,
      -876,-844,-812,-780,-748,-716,-684,-652,
      -620,-588,-556,-524,-492,-460,-428,-396,
      -372,-356,-340,-324,-308,-292,-276,-260,
      -244,-228,-212,-196,-180,-164,-148,-132,
      -120,-112,-104,-96,-88,-80,-72,-64,
      -56,-48,-40,-32,-24,-16,-8,0,
      32124,31100,30076,29052,28028,27004,25980,24956,
      23932,22908,21884,20860,19836,18812,17788,16764,
      15996,15484,14972,14460,13948,13436,12924,12412,
      11900,11388,10876,10364,9852,9340,8828,8316,
      7932,7676,7420,7164,6908,6652,6396,6140,
      5884,5628,5372,5116,4860,4604,4348,4092,
      3900,3772,3644,3516,3388,3260,3132,3004,
      2876,2748,2620,2492,2364,2236,2108,1980,
      1884,1820,1756,1692,1628,1564,1500,1436,
      1372,1308,1244,1180,1116,1052,988,924,
      876,844,812,780,748,716,684,652,
      620,588,556,524,492,460,428,396,
      372,356,340,324,308,292,276,260,
      244,228,212,196,180,164,148,132,
      120,112,104,96,88,80,72,64,
      56,48,40,32,24,16,8,0
    ];

    // Convert μ-law samples to 16-bit PCM
    const pcmData = new Int16Array(mulawBuffer.length);
    for (let i = 0; i < mulawBuffer.length; i++) {
      const mulawByte = mulawBuffer[i];
      if (mulawByte !== undefined && mulawByte < MULAW_TO_LINEAR.length) {
        pcmData[i] = MULAW_TO_LINEAR[mulawByte] || 0;
      } else {
        pcmData[i] = 0;
      }
    }

    // Create WAV header for 8kHz, 16-bit, mono
    const sampleRate = 8000;
    const bitsPerSample = 16;
    const channels = 1;
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    const dataSize = pcmData.length * 2;
    const fileSize = 36 + dataSize;

    const wavBuffer = Buffer.alloc(44 + dataSize);
    let offset = 0;

    // RIFF header
    wavBuffer.write('RIFF', offset); offset += 4;
    wavBuffer.writeUInt32LE(fileSize, offset); offset += 4;
    wavBuffer.write('WAVE', offset); offset += 4;

    // fmt chunk
    wavBuffer.write('fmt ', offset); offset += 4;
    wavBuffer.writeUInt32LE(16, offset); offset += 4; // chunk size
    wavBuffer.writeUInt16LE(1, offset); offset += 2; // PCM format
    wavBuffer.writeUInt16LE(channels, offset); offset += 2;
    wavBuffer.writeUInt32LE(sampleRate, offset); offset += 4;
    wavBuffer.writeUInt32LE(byteRate, offset); offset += 4;
    wavBuffer.writeUInt16LE(blockAlign, offset); offset += 2;
    wavBuffer.writeUInt16LE(bitsPerSample, offset); offset += 2;

    // data chunk
    wavBuffer.write('data', offset); offset += 4;
    wavBuffer.writeUInt32LE(dataSize, offset); offset += 4;

    // PCM data
    for (let i = 0; i < pcmData.length; i++) {
      const sample = pcmData[i] || 0;
      wavBuffer.writeInt16LE(sample, offset);
      offset += 2;
    }

    return wavBuffer;
  }

  /**
   * Calculate confidence score from Whisper response
   * Note: Whisper doesn't provide explicit confidence scores,
   * so we estimate based on response characteristics
   */
  private calculateConfidence(transcription: any): number {
    const text = transcription.text?.trim() || '';
    
    // Empty or very short text gets low confidence
    if (text.length < 3) return 0.1;
    
    // Check for signs of poor transcription
    const hasRepeatedWords = /\b(\w+)\s+\1\b/i.test(text);
    const hasStuttering = /\b\w{1,2}\s+\w{1,2}\s+\w{1,2}\b/.test(text);
    const isAllUppercase = text === text.toUpperCase() && text.length > 10;
    const hasSpecialChars = /[^\w\s'.,!?-]/.test(text);
    
    let confidence = 0.85; // Base confidence for Whisper
    
    if (hasRepeatedWords) confidence -= 0.2;
    if (hasStuttering) confidence -= 0.15;
    if (isAllUppercase) confidence -= 0.1;
    if (hasSpecialChars) confidence -= 0.1;
    
    // Boost confidence for common phrases
    const commonPhrases = [
      'hello', 'hi', 'thank you', 'please', 'yes', 'no',
      'appointment', 'booking', 'help', 'service'
    ];
    
    const lowerText = text.toLowerCase();
    const hasCommonPhrases = commonPhrases.some(phrase => lowerText.includes(phrase));
    if (hasCommonPhrases) confidence += 0.1;
    
    return Math.max(0.1, Math.min(0.95, confidence));
  }
}

// Mock service for development/testing
export class MockSpeechService implements SpeechRecognitionService {
  async transcribe(audioBuffer: Buffer, format: AudioFormat): Promise<SpeechRecognitionResult> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    // Generate mock transcripts based on buffer size (similar to current implementation)
    const bufferSize = audioBuffer.length;
    let mockText = '';
    let confidence = 0.85;
    
    if (bufferSize > 15000) {
      mockText = "I'd like to book an appointment for next week please";
      confidence = 0.92;
    } else if (bufferSize > 10000) {
      mockText = "What are your opening hours?";
      confidence = 0.88;
    } else if (bufferSize > 5000) {
      mockText = "Hello, I need some help";
      confidence = 0.85;
    } else if (bufferSize > 1000) {
      mockText = "Hi";
      confidence = 0.90;
    } else {
      mockText = "";
      confidence = 0.3;
    }
    
    return {
      text: mockText,
      confidence,
    };
  }
}

// Factory function to create appropriate speech service
export function createSpeechService(): SpeechRecognitionService {
  if (appConfig.openaiApiKey && appConfig.openaiApiKey !== 'sk-demo-key-for-testing') {
    return new WhisperSpeechService();
  } else {
    console.warn('No OpenAI API key configured, using mock speech service');
    return new MockSpeechService();
  }
}

// Export singleton instance
export const speechService = createSpeechService();