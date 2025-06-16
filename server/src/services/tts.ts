import axios from 'axios';
import { appConfig } from '@/config';

export interface TTSService {
  synthesize(text: string): Promise<Buffer>;
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
  if (appConfig.azureSpeechKey && appConfig.azureSpeechRegion) {
    return new AzureTTSService();
  } else if (appConfig.elevenlabsApiKey && appConfig.elevenlabsVoiceId) {
    return new ElevenLabsTTSService();
  } else {
    console.warn('No TTS service configured, using mock TTS service');
    return new MockTTSService();
  }
}

// Export singleton instance
export const ttsService = createTTSService();