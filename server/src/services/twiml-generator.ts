import { CallState } from './call-state';
import { ttsCacheManager, ttsAudioManager } from './tts';

export interface TwiMLOptions {
  message: string;
  expectsResponse: boolean;
  timeout?: number;
  speechTimeout?: number;
  retryMessage?: string;
  maxRetries?: number;
  action: string;
  callId?: string;
  useAdvancedTTS?: boolean;
}

export class TwiMLGenerator {
  private static readonly DEFAULT_TIMEOUT = 8; // Allow greeting to play fully  
  private static readonly DEFAULT_SPEECH_TIMEOUT = 1.2; // Aggressive for snappy responses
  private static readonly DEFAULT_MAX_RETRIES = 2;

  /**
   * Generate TwiML for conversation continuation
   */
  static async generateConversationTwiML(options: TwiMLOptions): Promise<string> {
    const {
      message,
      expectsResponse,
      timeout = this.getTimeoutForText(options.message), // Use dynamic timeout
      speechTimeout = this.DEFAULT_SPEECH_TIMEOUT,
      retryMessage = "Sorry, I didn't hear you. Could you please repeat that?",
      action,
      callId,
      useAdvancedTTS = true
    } = options;

    // Generate OpenAI TTS properly with async/await
    const mainAudioElement = await this.generateAudioElementSync(message, callId, useAdvancedTTS);
    const retryAudioElement = await this.generateAudioElementSync(retryMessage, callId, useAdvancedTTS);
    const goodbyeAudioElement = await this.generateAudioElementSync("Thanks for calling! Have a great day!", callId, useAdvancedTTS);

    if (expectsResponse) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="${timeout}" speechTimeout="${speechTimeout}" action="${action}">
        ${mainAudioElement}
    </Gather>
    ${retryAudioElement}
    ${goodbyeAudioElement}
    <Hangup/>
</Response>`;
    } else {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    ${mainAudioElement}
    ${goodbyeAudioElement}
    <Hangup/>
</Response>`;
    }
  }

  /**
   * Generate audio element synchronously with smart caching
   */
  private static async generateAudioElementSync(text: string, callId?: string, useAdvancedTTS: boolean = true): Promise<string> {
    // 100% OpenAI TTS requirement - always use advanced TTS
    console.log('🎯 Using 100% OpenAI TTS (no Twilio fallback allowed)');
    
    // Use the cache manager for smart TTS selection
    // This will return <Play> for cached OpenAI audio or properly wait for TTS
    return await ttsCacheManager.getAudioElement(text, callId);
  }

  /**
   * Generate audio element - either <Say> or <Play> based on TTS availability
   */
  private static async generateAudioElement(text: string, callId?: string, useAdvancedTTS: boolean = true): Promise<string> {
    // 100% OpenAI TTS requirement - always use advanced TTS
    console.log('🎯 Using 100% OpenAI TTS (no Twilio fallback allowed)');
    
    try {
      // Try to generate advanced TTS
      const { url, fallbackText } = await ttsAudioManager.generateAudioWithFallback(text, callId);
      
      if (url) {
        // Use <Play> for high-quality TTS
        return `<Play>${url}</Play>`;
      } else {
        // Use our enhanced TTS service instead of Twilio fallback
        return await ttsCacheManager.getAudioElement(text, callId);
      }
    } catch (error) {
      console.error('TTS generation failed, using enhanced TTS retry:', error);
      // Use enhanced TTS service retry instead of Twilio fallback
      return await ttsCacheManager.getAudioElement(text, callId);
    }
  }

  /**
   * Generate TwiML for initial greeting
   */
  static async generateGreetingTwiML(action: string, callId?: string): Promise<string> {
    return await this.generateConversationTwiML({
      message: "G'day! Thanks for calling. I'm Johnno, your AI assistant. How can I help you today?",
      expectsResponse: true,
      timeout: this.DEFAULT_TIMEOUT,
      speechTimeout: this.DEFAULT_SPEECH_TIMEOUT,
      retryMessage: "Sorry, I didn't hear you. Please tell me how I can help you today.",
      action,
      callId,
      useAdvancedTTS: true
    });
  }

  /**
   * Generate TwiML for error conditions
   */
  static generateErrorTwiML(errorMessage: string = "Sorry, we're experiencing technical difficulties."): string {
    // 100% OpenAI TTS requirement - use cached response or hang up instead of Twilio voice
    console.log('🚨 Error condition - checking for cached OpenAI TTS response');
    
    // Try to use cached OpenAI TTS for error message  
    const cachedErrorResponse = (ttsCacheManager as any).cache.get("Sorry mate, I'm having a bit of trouble right now. Please try again in a moment.");
    
    if (cachedErrorResponse) {
      console.log('Using cached OpenAI TTS for error response');
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play>${cachedErrorResponse}</Play>
    <Hangup/>
</Response>`;
    } else {
      console.log('No cached OpenAI TTS available - hanging up to maintain 100% OpenAI TTS requirement');
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Hangup/>
</Response>`;
    }
  }

  /**
   * Generate TwiML based on conversation state
   */
  static async generateStatefulTwiML(callState: CallState, message: string, action: string): Promise<string> {
    // Determine if we expect a response based on conversation step and message content
    const expectsResponse = this.shouldExpectResponse(callState, message);
    
    // Customize timeout based on conversation step
    const timeout = callState ? this.getTimeoutForStep(callState.conversationStep) : this.DEFAULT_TIMEOUT;
    
    // Generate appropriate retry message based on context
    const retryMessage = callState ? this.getRetryMessageForStep(callState.conversationStep) : "I didn't catch that. Could you please repeat?";

    return await this.generateConversationTwiML({
      message,
      expectsResponse,
      timeout,
      speechTimeout: this.DEFAULT_SPEECH_TIMEOUT,
      retryMessage,
      action,
      callId: callState.callSid,
      useAdvancedTTS: true
    });
  }

  /**
   * Determine if response should expect user input
   */
  private static shouldExpectResponse(callState: CallState, message: string): boolean {
    // Check for explicit indicators in message
    if (message.includes('?') || 
        message.toLowerCase().includes('what') ||
        message.toLowerCase().includes('how') ||
        message.toLowerCase().includes('when') ||
        message.toLowerCase().includes('please tell me') ||
        message.toLowerCase().includes('can you') ||
        message.toLowerCase().includes('would you like')) {
      return true;
    }

    // Check conversation step
    if (callState) {
      switch (callState.conversationStep) {
        case 'greeting':
        case 'collecting_info':
        case 'booking':
          return true;
        case 'completing':
          return false;
        default:
          return true; // Default to expecting response unless explicitly completing
      }
    }
    
    // Default to expecting response if no call state
    return true;
  }

  /**
   * Get appropriate timeout for conversation step
   */
  private static getTimeoutForStep(step: string): number {
    switch (step) {
      case 'greeting':
        return 3; // Fast initial response
      case 'collecting_info':
        return 2.5; // Very fast info collection
      case 'booking':
        return 4; // Reduced booking time
      default:
        return this.DEFAULT_TIMEOUT;
    }
  }

  /**
   * Calculate dynamic timeout based on text length and complexity
   */
  private static getTimeoutForText(text: string): number {
    const wordCount = text.split(' ').length;
    const hasQuestion = text.includes('?');
    const isComplex = text.includes('emergency') || text.includes('booking') || text.includes('termite');
    
    // Base timeout calculation - much more aggressive
    let timeout = this.DEFAULT_TIMEOUT;
    
    // Adjust for text length - smaller adjustments
    if (wordCount > 20) {
      timeout += 0.5; // Less additional time for long responses
    } else if (wordCount < 10) {
      timeout -= 0.5; // Faster for short responses
    }
    
    // Adjust for complexity - minimal addition
    if (isComplex || hasQuestion) {
      timeout += 0.5; // Small bump for complex topics
    }
    
    // Tighter bounds for snappy responses
    return Math.max(2, Math.min(timeout, 4));
  }

  /**
   * Get appropriate retry message for conversation step
   */
  private static getRetryMessageForStep(step: string): string {
    switch (step) {
      case 'greeting':
        return "Sorry, I didn't hear you. Please tell me how I can help you today.";
      case 'collecting_info':
        return "I didn't catch that. Could you please repeat your response?";
      case 'booking':
        return "Sorry, I missed that. Could you please tell me your booking details again?";
      default:
        return "Sorry, I didn't hear you. Could you please repeat that?";
    }
  }

  /**
   * Sanitize text for XML output
   */
  private static sanitizeForXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /**
   * Validate TwiML before sending
   */
  static validateTwiML(twiml: string): boolean {
    // Basic validation checks
    if (!twiml.includes('<?xml version="1.0" encoding="UTF-8"?>')) {
      console.error('TwiML missing XML declaration');
      return false;
    }
    
    if (!twiml.includes('<Response>') || !twiml.includes('</Response>')) {
      console.error('TwiML missing Response tags');
      return false;
    }

    // Simple validation - check for content elements (Play, Gather, or Hangup)
    if (!twiml.includes('<Play') && !twiml.includes('<Gather') && !twiml.includes('<Hangup')) {
      console.error('TwiML missing required content elements (Play, Gather, or Hangup)');
      return false;
    }

    // Check for basic XML structure
    if (twiml.split('<').length !== twiml.split('>').length) {
      console.error('TwiML has mismatched angle brackets');
      return false;
    }

    return true;
  }
}