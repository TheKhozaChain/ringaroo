import OpenAI from 'openai';
import { appConfig } from '@/config';
import { redis } from './redis';
import { knowledgeService } from './knowledge';
import { bookingService, BookingRequest } from './booking';
import { db } from './database';

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
  conversationState?: {
    askedForName?: boolean;
    askedForService?: boolean;
    hasName?: boolean;
    hasService?: boolean;
  };
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
  businessType: 'medical' | 'electrician' | 'beauty' | 'pestcontrol' | 'general';
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
  private responseCache: Map<string, { response: GPTResponse; timestamp: number }> = new Map();

  constructor() {
    this.openai = new OpenAI({
      apiKey: appConfig.openaiApiKey,
    });

    // Default business context set to Pest Blitz for demo
    this.defaultBusinessContext = {
      businessType: 'pestcontrol',
      businessName: 'Pest Blitz',
      services: ['Residential Pest Control', 'Commercial Pest Control', 'Termite Treatment', 'Ant Control', 'Cockroach Treatment', 'Spider Control', 'Rodent Control'],
      hours: {
        monday: '7:00 AM - 7:00 PM',
        tuesday: '7:00 AM - 7:00 PM', 
        wednesday: '7:00 AM - 7:00 PM',
        thursday: '7:00 AM - 7:00 PM',
        friday: '7:00 AM - 7:00 PM',
        saturday: '8:00 AM - 12:00 PM',
        sunday: 'Closed'
      },
      location: 'North Shore Sydney - Mosman, Cremorne, Kirribilli, North Sydney, Chatswood, Neutral Bay',
      phone: '02 8330 6682'
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

    // Create call record in database
    try {
      await db.createCall({
        tenantId,
        twilioCallSid: callSid,
        callerNumber,
        status: 'in_progress',
        transcript: [],
        actions: [],
        startedAt: context.startTime
      });
      console.log(`Call record created in database: ${callSid}`);
    } catch (error: any) {
      if (error.code === '23505') {
        console.log(`Call record already exists for ${callSid} - continuing with existing record`);
      } else {
        console.error(`Failed to create call record for ${callSid}:`, error);
      }
      // Continue anyway - don't fail the call if database write fails
    }

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

    // Initialize conversation state if not exists
    if (!context.conversationState) {
      context.conversationState = {
        askedForName: false,
        askedForService: false,
        hasName: false,
        hasService: false
      };
    }

    // Check for name and ask if needed
    if (!context.customerInfo?.name && !context.conversationState?.askedForName) {
      const extractedName = this.extractName(userInput);
      if (extractedName) {
        context.customerInfo.name = extractedName;
        context.conversationState.hasName = true;
      } else {
        // Only ask for name if this isn't a goodbye or if the user seems engaged
        if (detectedIntent !== 'goodbye' && userInput.trim().length > 0) {
          context.conversationState.askedForName = true;
          const nameRequestResponse: GPTResponse = {
            message: "Thanks for calling! Can I get your name please?",
            intent: detectedIntent,
            extractedInfo: {},
            confidence: 0.9
          };
          
          // Save context before returning
          await redis.set(`conversation:${callSid}`, JSON.stringify(context), 3600);
          return nameRequestResponse;
        }
      }
    } else if (context.customerInfo?.name) {
      context.conversationState.hasName = true;
    }

    // If we just asked for the name, the next input is likely the name
    if (context.conversationState?.askedForName && !context.conversationState?.hasName) {
      const extractedName = this.extractName(userInput, true); // more liberal extraction
      if (extractedName) {
        context.customerInfo.name = extractedName;
        context.conversationState.hasName = true;
      }
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
   * Generate intelligent response using GPT-4 - OPTIMIZED WITH CONCURRENT PROCESSING
   */
  private async generateGPTResponse(context: ConversationContext, userInput: string): Promise<GPTResponse> {
    // Check if we have a real OpenAI API key
    if (appConfig.openaiApiKey === 'sk-demo-key-for-testing') {
      console.log('Using demo key - falling back to simple responses');
      return this.generateFallbackResponse(userInput);
    }

    // Check cache first for common queries
    const cacheKey = this.getCacheKey(userInput, context);
    const cached = this.responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 minute cache
      console.log('Using cached response for similar query');
      return { ...cached.response };
    }

    try {
      console.log('🚀 Starting concurrent processing optimization...');
      const startTime = Date.now();
      
      // ✅ OPTIMIZATION 1: Detect intent once, use for all operations
      const detectedIntent = this.detectIntent(userInput);
      const knowledgeIntents = ['hours', 'services', 'inquiry', 'pricing'];
      
      // ✅ OPTIMIZATION 2: Run data operations concurrently with Promise.all
      
      // Knowledge search operation (with timeout)
      let knowledgePromise: Promise<string | null> = Promise.resolve(null);
      if (context.tenantId && knowledgeIntents.includes(detectedIntent)) {
        knowledgePromise = Promise.race([
          knowledgeService.getContextualKnowledge(
            context.tenantId,
            detectedIntent,
            userInput,
            context
          ),
          new Promise<null>((resolve) => 
            setTimeout(() => {
              console.log('Knowledge search timed out after 3 seconds');
              resolve(null);
            }, 3000)
          )
        ]).catch(error => {
          console.error('Knowledge search failed:', error);
          return null;
        });
      }
      
      // Customer info extraction (can run concurrently)
      const extractInfoPromise = Promise.resolve(this.extractCustomerInfo(userInput, detectedIntent));
      
      // ✅ OPTIMIZATION 3: Execute all data operations in parallel
      const [relevantKnowledge, extractedInfo] = await Promise.all([
        knowledgePromise,
        extractInfoPromise
      ]);
      
      const dataFetchTime = Date.now() - startTime;
      console.log(`🎯 Concurrent data fetch completed in ${dataFetchTime}ms`);
      
      // Process knowledge results
      if (relevantKnowledge) {
        context.knowledgeUsed.push(relevantKnowledge.substring(0, 100) + '...');
        console.log('Using knowledge base information in response');
      }
      
      // ✅ OPTIMIZATION 4: Build system prompt with all fetched data
      const systemPrompt = this.buildSystemPrompt(context, relevantKnowledge);
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...context.messages.slice(-8).map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      console.log('Sending request to OpenAI with', messages.length, 'messages');

      // ✅ OPTIMIZATION 5: GPT-4 call with timeout
      const completion = await Promise.race([
        this.openai.chat.completions.create({
          model: appConfig.openaiModel || 'gpt-4',
          messages,
          temperature: 0.7,
          max_tokens: 150,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('GPT-4 API timeout after 5 seconds')), 5000)
        )
      ]) as any;

      console.log('OpenAI API response received successfully');

      const response = completion.choices[0];
      if (!response) {
        throw new Error('No response from OpenAI API');
      }
      
      const message = response.message?.content || "G'day! How can I help you today?";
      
      const totalTime = Date.now() - startTime;
      console.log(`✅ Total response generated in ${totalTime}ms (Optimization: ${dataFetchTime}ms data fetch, ${totalTime - dataFetchTime}ms GPT)`);

      const gptResponse = {
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

      // Cache the response for similar future queries
      this.responseCache.set(cacheKey, {
        response: gptResponse,
        timestamp: Date.now()
      });

      return gptResponse;

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

    // Add business-specific instructions
    let businessSpecificGuidelines = '';
    if (business.businessType === 'pestcontrol') {
      businessSpecificGuidelines = `

**Pest Control Specific Guidelines:**
- Identify urgency: Emergency pest issues (termites, commercial) get priority booking
- Ask about pest type: Different pests require different treatments and timing
- Location matters: Confirm we service their area (North Shore Sydney)
- Safety focus: Reassure about pet/family-safe treatments
- Commercial clients: Mention health compliance documentation
- Service areas: Mosman, Cremorne, Kirribilli, North Sydney, Chatswood, Neutral Bay
- Emergency phrases: "urgent", "termites", "restaurant", "infestation" = priority
- Always mention our guarantee and risk assessment process`;
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
Sunday: ${business.hours.sunday}${knowledgeSection}${businessSpecificGuidelines}

**Guidelines:**
- For bookings: Ask for name, preferred service, and time
- Be natural and conversational, not robotic
- If you can't help, offer to transfer or take a message
- Only ask if you can help with anything else when the current conversation is clearly finished
- Avoid repeating the same questions or service offerings

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
        twilioCallSid: context.callSid,
        // Pre-populate with caller's phone number from Twilio
        customerPhone: context.customerInfo?.phone
      };
      context.bookingInProgress = true;
    }
    
    // Update booking request with extracted information
    if (extractedInfo.name) {
      context.bookingRequest.customerName = extractedInfo.name;
      console.log(`📝 Updated booking request with name: "${extractedInfo.name}"`);
    } else {
      console.log(`❌ No name extracted, booking request not updated. Current name: "${context.bookingRequest.customerName || 'NONE'}"`);
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
        
        // Update call record with booking action
        try {
          await db.query(
            `UPDATE ringaroo.calls 
             SET actions = jsonb_set(actions, '{-1}', $1::jsonb, true),
                 updated_at = NOW()
             WHERE twilio_call_sid = $2`,
            [
              JSON.stringify({
                type: 'booking_created',
                booking_id: booking.id,
                timestamp: new Date().toISOString()
              }),
              context.callSid
            ]
          );
          console.log(`Call record updated with booking: ${booking.id}`);
        } catch (dbError) {
          console.error(`Failed to update call record with booking:`, dbError);
        }
        
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
    
    // Check for emergency + service patterns first (highest priority)
    if ((input.includes('emergency') || input.includes('urgent')) && 
        (input.includes('termite') || input.includes('pest') || input.includes('cockroach') || 
         input.includes('ant') || input.includes('spider') || input.includes('rodent'))) {
      return 'booking'; // Emergency pest issues should be treated as booking requests
    }
    
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
  private extractName(userInput: string, isDirectResponse: boolean = false): string | null {
    const namePatterns = [
      /(?:my name is|i'm|i am|this is|it's|call me)\s+([A-Z][a-z]{2,})/i,
      /^([A-Z][a-z]{2,})\s+speaking$/i,
      /^([A-Z][a-z]{2,})\s+here$/i,
    ];

    if (isDirectResponse) {
      // More liberal pattern for when we've just asked for the name
      const directNameMatch = userInput.trim().match(/^([A-Z][a-z]{1,15})$/i);
      if (directNameMatch?.[1]) {
        const name = directNameMatch[1];
        console.log(`✅ Extracted name (direct response): "${name}" from input: "${userInput}"`);
        return name;
      }
    }

    for (const pattern of namePatterns) {
      const match = userInput.match(pattern);
      if (match?.[1]) {
        const name = match[1].trim();
        console.log(`✅ Extracted name: "${name}" from input: "${userInput}"`);
        return name;
      }
    }
    
    console.log(`❌ Could not extract name from input: "${userInput}"`);
    return null;
  }

  /**
   * Extract customer information from user input
   */
  private extractCustomerInfo(userInput: string, intent: string): Record<string, any> {
    const extractedInfo: Record<string, any> = {};
    
    // Name extraction is now handled separately in the main flow
    
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
    
    // Extract service preferences (check for any intent, not just booking)
    // Pest control services (primary business)
    const pestControlServices = [
      'termite', 'termites', 'termite emergency', 'termite treatment', 'termite inspection',
      'cockroach', 'cockroaches', 'cockroach treatment', 'roach', 'roaches',
      'ant', 'ants', 'ant control', 'ant treatment',
      'spider', 'spiders', 'spider control', 'spider treatment',
      'rodent', 'rodents', 'rat', 'rats', 'mouse', 'mice', 'rodent control',
      'pest control', 'pest treatment', 'pest inspection', 'pest emergency',
      'residential pest control', 'commercial pest control',
      'emergency pest', 'urgent pest'
    ];
    
    // Other services (fallback)
    const otherServices = [
      'consultation', 'checkup', 'appointment', 'treatment', 'exam', 'visit',
      'electrical', 'wiring', 'power', 'outlet', 'switch', 'emergency', 'repair',
      'facial', 'massage', 'eyebrow', 'eyelash', 'nail', 'wax', 'beauty'
    ];
    
    const allServices = [...pestControlServices, ...otherServices];
    
    // Check for service matches (prioritize longer matches first)
    const sortedServices = allServices.sort((a, b) => b.length - a.length);
    for (const service of sortedServices) {
      if (userInput.toLowerCase().includes(service)) {
        extractedInfo.preferredService = service;
        console.log(`✅ Extracted service: "${service}" from input: "${userInput}"`);
        break;
      }
    }
    
    if (!extractedInfo.preferredService) {
      console.log(`❌ Could not extract service from input: "${userInput}"`);
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
    

    
    return extractedInfo;
  }

  /**
   * Generate cache key for response caching
   */
  private getCacheKey(userInput: string, context: ConversationContext): string {
    const intent = this.detectIntent(userInput);
    const normalizedInput = userInput.toLowerCase().trim().substring(0, 50);
    return `${intent}:${normalizedInput}:${context.businessContext.businessType}`;
  }

  /**
   * End conversation and cleanup
   */
  async endConversation(callSid: string): Promise<void> {
    // Get conversation context before cleanup to update call record
    try {
      const contextData = await redis.get(`conversation:${callSid}`);
      if (contextData) {
        let context: ConversationContext;
        if (typeof contextData === 'string') {
          context = JSON.parse(contextData);
        } else {
          context = contextData as ConversationContext;
        }
        
        // Update call record with final status and duration
        try {
          const endTime = new Date();
          const startTime = new Date(context.startTime);
          const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
          
          await db.query(
            `UPDATE ringaroo.calls 
             SET status = 'completed', 
                 ended_at = $1,
                 duration_seconds = $2,
                 transcript = $3::jsonb,
                 updated_at = NOW()
             WHERE twilio_call_sid = $4`,
            [
              endTime,
              durationSeconds,
              JSON.stringify(context.messages || []),
              callSid
            ]
          );
          console.log(`Call ${callSid} completed - Duration: ${durationSeconds}s`);
        } catch (dbError) {
          console.error(`Failed to update call completion for ${callSid}:`, dbError);
        }
      }
    } catch (error) {
      console.error(`Error finalizing call ${callSid}:`, error);
    }
    
    // Clean up Redis conversation data
    await redis.delete(`conversation:${callSid}`);
  }
}

export const conversationService = new ConversationService();