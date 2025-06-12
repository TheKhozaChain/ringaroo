import OpenAI from 'openai';
import { appConfig } from '@/config';
import { redis } from './redis';

export interface ConversationContext {
  callSid: string;
  messages: ConversationMessage[];
  intent?: 'greeting' | 'booking' | 'inquiry' | 'hours' | 'services' | 'complaint' | 'goodbye';
  customerInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    preferredService?: string;
    preferredTime?: string;
  };
  businessContext: BusinessContext;
  startTime: Date;
  lastActivity: Date;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: Date;
  confidence?: number;
}

export interface BusinessContext {
  businessType: 'medical' | 'electrician' | 'beauty' | 'general';
  businessName: string;
  services: string[];
  hours: {
    monday: string;
    tuesday: string;
    wednesday: string;
    thursday: string;
    friday: string;
    saturday: string;
    sunday: string;
  };
  location: string;
  phone: string;
}

export interface GPTResponse {
  message: string;
  intent: string;
  confidence: number;
  suggestedActions?: string[];
  extractedInfo?: Record<string, any>;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class ConversationService {
  private openai: OpenAI;
  private defaultBusinessContext: BusinessContext;

  constructor() {
    this.openai = new OpenAI({
      apiKey: appConfig.openaiApiKey,
    });

    // Default business context for demo - can be customized per tenant
    this.defaultBusinessContext = {
      businessType: 'general',
      businessName: 'Aussie Business Services',
      services: ['consultation', 'booking', 'general inquiry', 'support'],
      hours: {
        monday: '9:00 AM - 5:00 PM',
        tuesday: '9:00 AM - 5:00 PM', 
        wednesday: '9:00 AM - 5:00 PM',
        thursday: '9:00 AM - 5:00 PM',
        friday: '9:00 AM - 5:00 PM',
        saturday: '9:00 AM - 12:00 PM',
        sunday: 'Closed'
      },
      location: 'Sydney, Australia',
      phone: '+61 2 5944 5971'
    };
  }

  /**
   * Initialize a new conversation
   */
  async initializeConversation(callSid: string, callerNumber?: string): Promise<ConversationContext> {
    const context: ConversationContext = {
      callSid,
      messages: [],
      businessContext: this.defaultBusinessContext,
      customerInfo: {
        phone: callerNumber
      },
      startTime: new Date(),
      lastActivity: new Date()
    };

    // Store in Redis
    await redis.set(`conversation:${callSid}`, JSON.stringify(context), 3600); // 1 hour expiry

    return context;
  }

  /**
   * Get existing conversation context
   */
  async getConversation(callSid: string): Promise<ConversationContext | null> {
    const data = await redis.get(`conversation:${callSid}`);
    if (!data) return null;

    const context = JSON.parse(data) as ConversationContext;
    // Convert date strings back to Date objects
    context.startTime = new Date(context.startTime);
    context.lastActivity = new Date(context.lastActivity);
    context.messages = context.messages.map(msg => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    }));

    return context;
  }

  /**
   * Process user input and generate intelligent response
   */
  async processUserInput(callSid: string, userInput: string, confidence: number = 1.0): Promise<GPTResponse> {
    let context = await this.getConversation(callSid);
    
    if (!context) {
      context = await this.initializeConversation(callSid);
    }

    // Add user message to conversation
    const userMessage: ConversationMessage = {
      role: 'user',
      content: userInput,
      timestamp: new Date(),
      confidence
    };
    context.messages.push(userMessage);
    context.lastActivity = new Date();

    // Generate response using GPT-4
    const response = await this.generateGPTResponse(context, userInput);

    // Add assistant response to conversation
    const assistantMessage: ConversationMessage = {
      role: 'assistant',
      content: response.message,
      timestamp: new Date()
    };
    context.messages.push(assistantMessage);

    // Update intent and extracted info
    context.intent = response.intent as any;
    if (response.extractedInfo) {
      context.customerInfo = { ...context.customerInfo, ...response.extractedInfo };
    }

    // Save updated context
    await redis.set(`conversation:${callSid}`, JSON.stringify(context), 3600);

    return response;
  }

  /**
   * Generate intelligent response using GPT-4
   */
  private async generateGPTResponse(context: ConversationContext, userInput: string): Promise<GPTResponse> {
    // For now, let's use fallback responses to ensure it works
    // We can debug the GPT-4 integration once the basic flow is working
    console.log('Using fallback responses for testing - GPT-4 integration temporarily disabled');
    return this.generateFallbackResponse(userInput);
  }

  /**
   * Build system prompt based on business context and conversation state
   */
  private buildSystemPrompt(context: ConversationContext): string {
    const business = context.businessContext;
    
    return `You are Johnno, a friendly Australian AI receptionist for ${business.businessName}.

**Your Role:**
- Warm, professional Australian personality (use "G'day", "no worries", "mate" naturally)
- Help customers with inquiries, bookings, hours, and general questions
- Keep responses conversational but under 40 words for phone calls
- Be helpful and efficient

**Business Information:**
- Business: ${business.businessName}
- Services: ${business.services.join(', ')}
- Location: ${business.location}
- Phone: ${business.phone}

**Hours:**
Monday-Friday: ${business.hours.monday}
Saturday: ${business.hours.saturday}
Sunday: ${business.hours.sunday}

**Guidelines:**
- For bookings: Ask for name, preferred service, and time
- Be natural and conversational, not robotic
- If you can't help, offer to transfer or take a message
- Always end with asking how else you can help

**Current conversation context:**
${context.intent ? `- Current intent: ${context.intent}` : ''}
${context.customerInfo?.name ? `- Customer name: ${context.customerInfo.name}` : ''}
${context.customerInfo?.preferredService ? `- Service interest: ${context.customerInfo.preferredService}` : ''}`;
  }

  /**
   * Fallback response when GPT-4 is not available
   */
  private generateFallbackResponse(userInput: string): GPTResponse {
    const input = userInput.toLowerCase();
    let message = "Thanks for calling! How can I help you today?";
    let intent = 'inquiry';

    if (input.includes('hello') || input.includes('hi') || input.includes('g\'day')) {
      message = "G'day mate! Great to hear from you. What can I help you with today?";
      intent = 'greeting';
    } else if (input.includes('book') || input.includes('appointment')) {
      message = "No worries! I'd be happy to help you book an appointment. What service are you interested in?";
      intent = 'booking';
    } else if (input.includes('hours') || input.includes('open') || input.includes('time')) {
      message = "We're open Monday to Friday 9am to 5pm, and Saturday mornings 9am to 12pm. When would you like to come in?";
      intent = 'hours';
    } else if (input.includes('service') || input.includes('help') || input.includes('do')) {
      message = "We offer consultations, bookings, and general support. What specifically can I help you with?";
      intent = 'services';
    } else if (input.includes('thank') || input.includes('bye') || input.includes('goodbye')) {
      message = "No worries mate! Thanks for calling. Have a great day!";
      intent = 'goodbye';
    } else {
      message = `Right, I heard you mention "${userInput}". How can I help you with that today?`;
      intent = 'inquiry';
    }

    return {
      message,
      intent,
      confidence: 0.8
    };
  }

  /**
   * End conversation and cleanup
   */
  async endConversation(callSid: string): Promise<void> {
    await redis.delete(`conversation:${callSid}`);
  }
}

export const conversationService = new ConversationService();