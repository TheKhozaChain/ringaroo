import OpenAI from 'openai';
import { appConfig } from '@/config';
import { redis } from './redis';
import { knowledgeService } from './knowledge';
import { bookingService, BookingRequest } from './booking';

export interface ConversationContext {
  callSid: string;
  tenantId: string;
  messages: ConversationMessage[];
  intent?: 'greeting' | 'booking' | 'inquiry' | 'hours' | 'services' | 'complaint' | 'goodbye';
  customerInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    preferredService?: string;
    preferredTime?: string;
    preferredDate?: string;
  };
  businessContext: BusinessContext;
  knowledgeUsed: string[];
  bookingInProgress?: boolean;
  bookingRequest?: BookingRequest;
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
  async initializeConversation(callSid: string, callerNumber?: string, tenantId: string = '550e8400-e29b-41d4-a716-446655440000'): Promise<ConversationContext> {
    const context: ConversationContext = {
      callSid,
      tenantId,
      messages: [],
      businessContext: this.defaultBusinessContext,
      customerInfo: {
        phone: callerNumber
      },
      knowledgeUsed: [],
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

    // Handle both string and already-parsed object
    const context = typeof data === 'string' ? JSON.parse(data) : data;
    // Convert date strings back to Date objects
    context.startTime = new Date(context.startTime);
    context.lastActivity = new Date(context.lastActivity);
    context.messages = context.messages.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    }));

    return context;
  }

  /**
   * Process user input and generate intelligent response
   */
  async processUserInput(callSid: string, userInput: string, confidence: number = 1.0, tenantId?: string): Promise<GPTResponse> {
    let context = await this.getConversation(callSid);
    
    if (!context) {
      context = await this.initializeConversation(callSid, undefined, tenantId);
    }
    
    // Ensure tenantId is set (for backward compatibility)
    if (!context.tenantId && tenantId) {
      context.tenantId = tenantId;
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

    // Detect intent early for booking processing
    const detectedIntent = this.detectIntent(userInput);
    
    // Process booking flow if active or intent is booking
    let bookingResponse = null;
    if (context.bookingInProgress || detectedIntent === 'booking') {
      const extractedInfo = this.extractCustomerInfo(userInput, detectedIntent);
      bookingResponse = await this.processBookingFlow(context, userInput, extractedInfo);
    }

    // Generate response using GPT-4 (or use booking response)
    const finalResponse = bookingResponse || await this.generateGPTResponse(context, userInput);

    // Add assistant response to conversation
    const assistantMessage: ConversationMessage = {
      role: 'assistant',
      content: finalResponse.message,
      timestamp: new Date()
    };
    context.messages.push(assistantMessage);

    // Update intent and extracted info
    context.intent = finalResponse.intent as any;
    if (finalResponse.extractedInfo) {
      context.customerInfo = { ...context.customerInfo, ...finalResponse.extractedInfo };
    }

    // Save updated context
    await redis.set(`conversation:${callSid}`, JSON.stringify(context), 3600);

    return finalResponse;
  }

  /**
   * Generate intelligent response using GPT-4
   */
  private async generateGPTResponse(context: ConversationContext, userInput: string): Promise<GPTResponse> {
    // Check if we have a real OpenAI API key
    if (appConfig.openaiApiKey === 'sk-demo-key-for-testing') {
      console.log('Using demo key - falling back to simple responses');
      return this.generateFallbackResponse(userInput);
    }

    try {
      console.log('Attempting GPT-4 API call with key:', appConfig.openaiApiKey?.substring(0, 20) + '...');
      
      // Detect intent first for knowledge search
      const detectedIntent = this.detectIntent(userInput);
      
      // Search for relevant knowledge
      let relevantKnowledge: string | null = null;
      if (context.tenantId) {
        try {
          relevantKnowledge = await knowledgeService.getContextualKnowledge(
            context.tenantId,
            detectedIntent,
            userInput,
            context
          );
          
          if (relevantKnowledge) {
            context.knowledgeUsed.push(relevantKnowledge.substring(0, 100) + '...');
            console.log('Using knowledge base information in response');
          }
        } catch (error) {
          console.error('Knowledge search failed:', error);
        }
      }
      
      const systemPrompt = this.buildSystemPrompt(context, relevantKnowledge);
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...context.messages.slice(-8).map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      console.log('Sending request to OpenAI with', messages.length, 'messages');

      const completion = await this.openai.chat.completions.create({
        model: appConfig.openaiModel || 'gpt-4',
        messages,
        temperature: 0.7,
        max_tokens: 150,
      });

      console.log('OpenAI API response received successfully');

      const response = completion.choices[0];
      if (!response) {
        throw new Error('No response from OpenAI API');
      }
      
      const message = response.message?.content || "G'day! How can I help you today?";
      
      // Extract customer information from the conversation
      let extractedInfo = this.extractCustomerInfo(userInput, detectedIntent);

      return {
        message,
        intent: detectedIntent,
        confidence: 0.8,
        extractedInfo,
        tokenUsage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0
        }
      };

    } catch (error: any) {
      console.error('GPT-4 API error details:', {
        message: error.message,
        status: error.status,
        type: error.type,
        code: error.code
      });
      
      // Fall back to simple responses on any error
      return this.generateFallbackResponse(userInput);
    }
  }

  /**
   * Build system prompt based on business context and conversation state
   */
  private buildSystemPrompt(context: ConversationContext, relevantKnowledge?: string | null): string {
    const business = context.businessContext;
    
    let knowledgeSection = '';
    if (relevantKnowledge) {
      knowledgeSection = `

**Relevant Business Information:**
${relevantKnowledge}

**Important:** Use the above information to answer the customer's question accurately. This information is specific to our business and should take priority over general knowledge.`;
    }
    
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
Sunday: ${business.hours.sunday}${knowledgeSection}

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
   * Process booking flow and return appropriate response
   */
  private async processBookingFlow(context: ConversationContext, userInput: string, extractedInfo: Record<string, any>): Promise<GPTResponse | null> {
    
    // Initialize booking request if not already started
    if (!context.bookingRequest) {
      context.bookingRequest = {
        tenantId: context.tenantId,
        twilioCallSid: context.callSid
      };
      context.bookingInProgress = true;
    }
    
    // Update booking request with extracted information
    if (extractedInfo.name) {
      context.bookingRequest.customerName = extractedInfo.name;
    }
    if (extractedInfo.phone) {
      context.bookingRequest.customerPhone = extractedInfo.phone;
    }
    if (extractedInfo.email) {
      context.bookingRequest.customerEmail = extractedInfo.email;
    }
    if (extractedInfo.preferredService) {
      context.bookingRequest.serviceType = extractedInfo.preferredService;
    }
    if (extractedInfo.preferredTime) {
      context.bookingRequest.preferredTime = extractedInfo.preferredTime;
    }
    if (extractedInfo.preferredDate) {
      context.bookingRequest.preferredDate = extractedInfo.preferredDate;
    }
    
    // Also update from conversation context customerInfo
    if (context.customerInfo) {
      if (context.customerInfo.name && !context.bookingRequest.customerName) {
        context.bookingRequest.customerName = context.customerInfo.name;
      }
      if (context.customerInfo.phone && !context.bookingRequest.customerPhone) {
        context.bookingRequest.customerPhone = context.customerInfo.phone;
      }
      if (context.customerInfo.email && !context.bookingRequest.customerEmail) {
        context.bookingRequest.customerEmail = context.customerInfo.email;
      }
      if (context.customerInfo.preferredService && !context.bookingRequest.serviceType) {
        context.bookingRequest.serviceType = context.customerInfo.preferredService;
      }
      if (context.customerInfo.preferredTime && !context.bookingRequest.preferredTime) {
        context.bookingRequest.preferredTime = context.customerInfo.preferredTime;
      }
      if (context.customerInfo.preferredDate && !context.bookingRequest.preferredDate) {
        context.bookingRequest.preferredDate = context.customerInfo.preferredDate;
      }
    }
    
    // Check if we have enough information to complete the booking
    if (bookingService.isBookingComplete(context.bookingRequest)) {
      try {
        const booking = await bookingService.createBooking(context.bookingRequest);
        const confirmationMessage = bookingService.generateBookingConfirmation(booking);
        
        // Reset booking state
        context.bookingInProgress = false;
        context.bookingRequest = undefined;
        
        return {
          message: confirmationMessage,
          intent: 'booking',
          confidence: 1.0,
          extractedInfo: {}
        };
      } catch (error) {
        console.error('Failed to create booking:', error);
        
        // Reset booking state on error
        context.bookingInProgress = false;
        context.bookingRequest = undefined;
        
        return {
          message: "I'm sorry, there was a technical issue processing your booking. Please try again, or I can transfer you to someone who can help you directly. What would you prefer?",
          intent: 'booking',
          confidence: 1.0,
          extractedInfo: {}
        };
      }
    }
    
    // Ask for missing information
    const nextQuestion = bookingService.getNextBookingQuestion(context.bookingRequest);
    if (nextQuestion) {
      return {
        message: nextQuestion,
        intent: 'booking',
        confidence: 1.0,
        extractedInfo: {}
      };
    }
    
    // This shouldn't happen, but handle gracefully
    return {
      message: "Let me help you with your booking. What would you like to book?",
      intent: 'booking',
      confidence: 1.0,
      extractedInfo: {}
    };
  }

  /**
   * Detect user intent from input
   */
  private detectIntent(userInput: string): string {
    const input = userInput.toLowerCase();
    
    if (input.includes('hello') || input.includes('hi') || input.includes('g\'day')) {
      return 'greeting';
    } else if (input.includes('book') || input.includes('appointment') || input.includes('schedule')) {
      return 'booking';
    } else if (input.includes('hour') || input.includes('open') || input.includes('close') || input.includes('time')) {
      return 'hours';
    } else if (input.includes('service') || input.includes('offer') || input.includes('what do you') || input.includes('help with')) {
      return 'services';
    } else if (input.includes('price') || input.includes('cost') || input.includes('charge') || input.includes('fee')) {
      return 'pricing';
    } else if (input.includes('thank') || input.includes('bye') || input.includes('goodbye')) {
      return 'goodbye';
    } else if (input.includes('complain') || input.includes('problem') || input.includes('issue') || input.includes('unhappy')) {
      return 'complaint';
    } else {
      return 'inquiry';
    }
  }

  /**
   * Extract customer information from user input
   */
  private extractCustomerInfo(userInput: string, intent: string): Record<string, any> {
    const extractedInfo: Record<string, any> = {};
    
    // Extract name patterns
    const nameMatch = userInput.match(/(?:my name is|i'm|i am|this is) ([a-zA-Z\s]+)/i);
    if (nameMatch?.[1]) {
      extractedInfo.name = nameMatch[1].trim();
    }
    
    // Extract phone patterns
    const phoneMatch = userInput.match(/(\+?[0-9\s\-\(\)]{8,})/);
    if (phoneMatch?.[1]) {
      extractedInfo.phone = phoneMatch[1].trim();
    }
    
    // Extract email patterns
    const emailMatch = userInput.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch?.[1]) {
      extractedInfo.email = emailMatch[1].trim();
    }
    
    // Extract service preferences for booking intent
    if (intent === 'booking') {
      // Medical services
      const medicalServices = ['consultation', 'checkup', 'appointment', 'treatment', 'exam', 'visit'];
      // Electrician services  
      const electricianServices = ['electrical', 'wiring', 'power', 'outlet', 'switch', 'emergency', 'repair'];
      // Beauty services
      const beautyServices = ['facial', 'massage', 'eyebrow', 'eyelash', 'nail', 'wax', 'beauty', 'treatment'];
      
      const allServices = [...medicalServices, ...electricianServices, ...beautyServices];
      
      for (const service of allServices) {
        if (userInput.toLowerCase().includes(service)) {
          extractedInfo.preferredService = service;
          break;
        }
      }
      
      // Extract time preferences
      const timeMatch = userInput.match(/(?:at |around |about |for )([0-9]{1,2}(?::[0-9]{2})?\s?(?:am|pm|AM|PM)?)/i);
      if (timeMatch?.[1]) {
        extractedInfo.preferredTime = timeMatch[1].trim();
      }
      
      // Extract date preferences
      const datePatterns = [
        /(?:on |for )(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        /(?:on |for )([0-9]{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)/i,
        /(?:on |for )([0-9]{1,2}\/[0-9]{1,2}(?:\/[0-9]{2,4})?)/i
      ];
      
      for (const pattern of datePatterns) {
        const dateMatch = userInput.match(pattern);
        if (dateMatch?.[1]) {
          extractedInfo.preferredDate = dateMatch[1].trim();
          break;
        }
      }
    }
    
    // Also extract these for any intent (they might mention their name/phone anytime)
    
    // Extract just the first name if they say something like "Hi, this is John" 
    const simpleNameMatch = userInput.match(/(?:hi|hello|g'day),?\s+(?:this is |i'm |it's )?([a-zA-Z]+)/i);
    if (simpleNameMatch?.[1] && !extractedInfo.name) {
      extractedInfo.name = simpleNameMatch[1].trim();
    }
    
    return extractedInfo;
  }

  /**
   * End conversation and cleanup
   */
  async endConversation(callSid: string): Promise<void> {
    await redis.delete(`conversation:${callSid}`);
  }
}

export const conversationService = new ConversationService();