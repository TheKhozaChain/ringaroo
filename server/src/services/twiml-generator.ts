import { CallState } from './call-state';

export interface TwiMLOptions {
  message: string;
  expectsResponse: boolean;
  timeout?: number;
  speechTimeout?: number;
  retryMessage?: string;
  maxRetries?: number;
  action: string;
}

export class TwiMLGenerator {
  private static readonly DEFAULT_TIMEOUT = 6;
  private static readonly DEFAULT_SPEECH_TIMEOUT = 2;
  private static readonly DEFAULT_MAX_RETRIES = 2;

  /**
   * Generate TwiML for conversation continuation
   */
  static generateConversationTwiML(options: TwiMLOptions): string {
    const {
      message,
      expectsResponse,
      timeout = this.DEFAULT_TIMEOUT,
      speechTimeout = this.DEFAULT_SPEECH_TIMEOUT,
      retryMessage = "Sorry, I didn't hear you. Could you please repeat that?",
      action
    } = options;

    // Sanitize message for XML
    const sanitizedMessage = this.sanitizeForXML(message);
    const sanitizedRetryMessage = this.sanitizeForXML(retryMessage);

    if (expectsResponse) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="${timeout}" speechTimeout="${speechTimeout}" action="${action}">
        <Say voice="man">${sanitizedMessage}</Say>
    </Gather>
    <Say voice="man">${sanitizedRetryMessage}</Say>
    <Say voice="man">Thanks for calling! Have a great day!</Say>
    <Hangup/>
</Response>`;
    } else {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="man">${sanitizedMessage}</Say>
    <Say voice="man">Thanks for calling! Have a great day!</Say>
    <Hangup/>
</Response>`;
    }
  }

  /**
   * Generate TwiML for initial greeting
   */
  static generateGreetingTwiML(action: string): string {
    return this.generateConversationTwiML({
      message: "G'day! Thanks for calling. I'm Johnno, your AI assistant. How can I help you today?",
      expectsResponse: true,
      timeout: this.DEFAULT_TIMEOUT,
      speechTimeout: this.DEFAULT_SPEECH_TIMEOUT,
      retryMessage: "Sorry, I didn't hear you. Please tell me how I can help you today.",
      action
    });
  }

  /**
   * Generate TwiML for error conditions
   */
  static generateErrorTwiML(errorMessage: string = "Sorry, we're experiencing technical difficulties."): string {
    const sanitizedMessage = this.sanitizeForXML(errorMessage);
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="man">${sanitizedMessage}</Say>
    <Say voice="man">Please try calling back later. Thanks for your patience!</Say>
    <Hangup/>
</Response>`;
  }

  /**
   * Generate TwiML based on conversation state
   */
  static generateStatefulTwiML(callState: CallState, message: string, action: string): string {
    // Determine if we expect a response based on conversation step and message content
    const expectsResponse = this.shouldExpectResponse(callState, message);
    
    // Customize timeout based on conversation step
    const timeout = this.getTimeoutForStep(callState.conversationStep);
    
    // Generate appropriate retry message based on context
    const retryMessage = this.getRetryMessageForStep(callState.conversationStep);

    return this.generateConversationTwiML({
      message,
      expectsResponse,
      timeout,
      speechTimeout: this.DEFAULT_SPEECH_TIMEOUT,
      retryMessage,
      action
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

  /**
   * Get appropriate timeout for conversation step
   */
  private static getTimeoutForStep(step: string): number {
    switch (step) {
      case 'greeting':
        return 8; // Reduced time for initial response
      case 'collecting_info':
        return 6; // Reduced time for info collection
      case 'booking':
        return 8; // Reduced time for booking details
      default:
        return this.DEFAULT_TIMEOUT;
    }
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

    // Simple validation - just check for required elements
    if (!twiml.includes('<Say') && !twiml.includes('<Gather')) {
      console.error('TwiML missing required content elements');
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