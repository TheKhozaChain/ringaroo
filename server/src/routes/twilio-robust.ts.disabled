import { FastifyPluginAsync } from 'fastify';
import { CallStateManager, CallState } from '@/services/call-state';
import { TwiMLGenerator } from '@/services/twiml-generator';
import { conversationService } from '@/services/conversation';

const twilioRobustRoutes: FastifyPluginAsync = async function (fastify) {
  
  // Sanitize phone number to prevent display issues
  function sanitizePhoneNumber(phoneNumber: string | undefined): string | undefined {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return undefined;
    }
    
    // Remove any non-digit/non-+ characters
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    // Validate length (max 15 digits for international format)
    if (cleaned.length > 16) { // +15 digits max
      console.log(`⚠️ WARNING: Phone number too long: ${phoneNumber}`);
      return undefined;
    }
    
    // Check for numeric overflow issues
    if (cleaned.includes('e') || cleaned.includes('E') || cleaned.toLowerCase().includes('infinity')) {
      console.log(`⚠️ WARNING: Invalid phone number format: ${phoneNumber}`);
      return undefined;
    }
    
    return cleaned;
  }
  
  /**
   * Incoming call webhook - Initialize call state and return greeting
   */
  fastify.post('/twilio/voice', async (request, reply) => {
    const startTime = Date.now();
    
    try {
      const { CallSid, From, To } = request.body as any;

      // Enhanced logging with request ID for tracing
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      fastify.log.info('=== INCOMING CALL START ===', { 
        requestId,
        CallSid, 
        From, 
        To,
        userAgent: request.headers['user-agent'],
        timestamp: new Date().toISOString(),
        host: request.headers.host
      });

      // Validate required parameters
      if (!CallSid) {
        fastify.log.error('Missing CallSid in webhook request', { requestId });
        const errorTwiML = TwiMLGenerator.generateErrorTwiML('Invalid call parameters.');
        return reply.type('text/xml').send(errorTwiML);
      }

      // Check if this call already exists (potential duplicate webhook)
      const existingCallState = await CallStateManager.getCallState(CallSid);
      if (existingCallState && existingCallState.status === 'active') {
        fastify.log.warn('Duplicate call webhook received', { 
          requestId, 
          CallSid, 
          existingStep: existingCallState.conversationStep,
          totalInteractions: existingCallState.totalInteractions
        });
        
        // Return the current state's appropriate response rather than restarting
        const action = `https://${request.headers.host}/twilio/gather`;
        const twiml = TwiMLGenerator.generateGreetingTwiML(action, CallSid);
        return reply.type('text/xml').send(twiml);
      }

      // Initialize new call state
      const callState = await CallStateManager.initializeCall(CallSid);
      fastify.log.info('Call state initialized', { 
        requestId, 
        CallSid, 
        step: callState.conversationStep 
      });

      // Sanitize phone number before passing to conversation service
      const sanitizedFromNumber = sanitizePhoneNumber(From);
      // Initialize conversation context
      await conversationService.initializeConversation(CallSid, sanitizedFromNumber);
      fastify.log.info('Conversation service initialized', { requestId, CallSid });

      // Set call as awaiting initial response
      await CallStateManager.setAwaitingResponse(CallSid, true, 'awaiting_initial_input');

      // Generate greeting TwiML with proper action URL
      const action = `https://${request.headers.host}/twilio/gather`;
      const twiml = TwiMLGenerator.generateGreetingTwiML(action, CallSid);

      // Validate TwiML before sending
      if (!TwiMLGenerator.validateTwiML(twiml)) {
        fastify.log.error('Generated invalid TwiML', { requestId, CallSid });
        const errorTwiML = TwiMLGenerator.generateErrorTwiML();
        return reply.type('text/xml').send(errorTwiML);
      }

      const processingTime = Date.now() - startTime;
      fastify.log.info('=== INCOMING CALL COMPLETE ===', { 
        requestId, 
        CallSid, 
        processingTimeMs: processingTime,
        twimlLength: twiml.length
      });

      reply.type('text/xml').send(twiml);
      
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      fastify.log.error('=== INCOMING CALL ERROR ===', {
        error: error.message,
        stack: error.stack,
        CallSid: (request.body as any)?.CallSid,
        From: (request.body as any)?.From,
        To: (request.body as any)?.To,
        processingTimeMs: processingTime
      });
      
      const errorTwiML = TwiMLGenerator.generateErrorTwiML();
      reply.status(500).type('text/xml').send(errorTwiML);
    }
  });

  /**
   * Speech input handler - Process user input and continue conversation
   */
  fastify.post('/twilio/gather', async (request, reply) => {
    const startTime = Date.now();
    
    try {
      const { CallSid, SpeechResult, Confidence } = request.body as any;
      
      // Enhanced logging with request ID for tracing
      const requestId = `gather_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      fastify.log.info('=== SPEECH INPUT START ===', { 
        requestId,
        CallSid, 
        SpeechResult, 
        Confidence,
        speechLength: SpeechResult ? SpeechResult.length : 0,
        confidenceFloat: parseFloat(Confidence || '0'),
        timestamp: new Date().toISOString(),
        host: request.headers.host
      });

      // Validate required parameters
      if (!CallSid) {
        fastify.log.error('Missing CallSid in gather request', { requestId });
        const errorTwiML = TwiMLGenerator.generateErrorTwiML('Invalid call parameters.');
        return reply.type('text/xml').send(errorTwiML);
      }

      // Get and validate call state
      const callState = await CallStateManager.getCallState(CallSid);
      if (!callState) {
        fastify.log.error('Call state not found', { requestId, CallSid });
        
        // Try to reinitialize conversation if possible
        try {
          await conversationService.initializeConversation(CallSid);
          const newCallState = await CallStateManager.initializeCall(CallSid);
          fastify.log.info('Reinitialized lost call state', { requestId, CallSid });
        } catch (reinitError) {
          fastify.log.error('Failed to reinitialize call state', { requestId, CallSid, error: reinitError });
          const errorTwiML = TwiMLGenerator.generateErrorTwiML('Call session expired. Please call back.');
          return reply.type('text/xml').send(errorTwiML);
        }
      }

      // Validate call can continue
      if (!await CallStateManager.validateCallContinuation(CallSid)) {
        fastify.log.warn('Call cannot continue', { 
          requestId, 
          CallSid, 
          reason: 'validation_failed',
          callState: callState ? {
            status: callState.status,
            errorCount: callState.errorCount,
            totalInteractions: callState.totalInteractions
          } : 'missing'
        });
        
        const errorTwiML = TwiMLGenerator.generateErrorTwiML('Call session ended. Please call back if you need assistance.');
        return reply.type('text/xml').send(errorTwiML);
      }

      // Check if we were expecting a response
      if (!callState!.awaitingResponse) {
        fastify.log.warn('Unexpected speech input', { 
          requestId, 
          CallSid, 
          context: callState!.conversationContext,
          step: callState!.conversationStep
        });
      }

      let responseMessage = "I didn't quite catch that. Could you please repeat what you said?";
      let shouldContinue = true;
      let newConversationStep = callState!.conversationStep;

      // Process speech input if we have reasonable confidence (lowered to reduce retries)
      const confidenceThreshold = 0.2;
      if (SpeechResult && parseFloat(Confidence || '0') >= confidenceThreshold) {
        try {
          fastify.log.info('Processing speech with conversation service', { 
            requestId, 
            CallSid, 
            inputLength: SpeechResult.length 
          });

          // Update call state to processing
          await CallStateManager.updateCallState(CallSid, {
            conversationStep: 'processing_request',
            awaitingResponse: false,
            conversationContext: 'processing_gpt_request'
          });

          // Process with conversation service
          const gptResponse = await conversationService.processUserInput(
            CallSid, 
            SpeechResult, 
            parseFloat(Confidence || '1.0')
          );
          
          responseMessage = gptResponse.message;
          
          // Determine next conversation step based on intent
          switch (gptResponse.intent) {
            case 'greeting':
              newConversationStep = 'collecting_info';
              break;
            case 'booking':
              newConversationStep = 'booking';
              break;
            case 'goodbye':
              newConversationStep = 'completing';
              shouldContinue = false;
              break;
            default:
              newConversationStep = 'collecting_info';
          }

          fastify.log.info('GPT response generated successfully', {
            requestId,
            CallSid,
            userInput: SpeechResult,
            gptResponse: responseMessage.substring(0, 200) + (responseMessage.length > 200 ? '...' : ''),
            intent: gptResponse.intent,
            confidence: gptResponse.confidence,
            responseLength: responseMessage.length,
            newStep: newConversationStep,
            tokenUsage: gptResponse.tokenUsage
          });
          
        } catch (gptError: any) {
          fastify.log.error('Conversation service error', {
            requestId,
            error: gptError.message,
            stack: gptError.stack,
            CallSid,
            SpeechResult,
            Confidence
          });
          
          // Record error in call state
          await CallStateManager.recordError(CallSid, `GPT Error: ${gptError.message}`);
          
          // Use fallback response
          responseMessage = "No worries mate! I'm here to help. Could you tell me what you need assistance with?";
          newConversationStep = 'collecting_info';
        }
      } else {
        fastify.log.info('Low confidence or empty speech result', { 
          requestId, 
          CallSid, 
          Confidence,
          hasResult: !!SpeechResult
        });
        
        // Record low confidence as potential error
        await CallStateManager.recordError(CallSid, `Low confidence: ${Confidence}`);
        
        // Use retry message appropriate for current step
        newConversationStep = callState!.conversationStep; // Keep current step
      }

      // Update call state with new step and response expectation
      const updatedCallState = await CallStateManager.updateCallState(CallSid, {
        conversationStep: newConversationStep,
        awaitingResponse: shouldContinue,
        conversationContext: shouldContinue ? `awaiting_response_in_${newConversationStep}` : 'call_completing'
      });

      if (!updatedCallState) {
        fastify.log.error('Failed to update call state', { requestId, CallSid });
        const errorTwiML = TwiMLGenerator.generateErrorTwiML();
        return reply.type('text/xml').send(errorTwiML);
      }

      // Generate appropriate TwiML response
      const action = `https://${request.headers.host}/twilio/gather`;
      const twiml = shouldContinue 
        ? TwiMLGenerator.generateStatefulTwiML(updatedCallState, responseMessage, action)
        : TwiMLGenerator.generateConversationTwiML({ 
            message: responseMessage, 
            expectsResponse: false, 
            action,
            callId: CallSid,
            useAdvancedTTS: true
          });

      // Validate TwiML before sending
      if (!TwiMLGenerator.validateTwiML(twiml)) {
        fastify.log.error('Generated invalid TwiML', { requestId, CallSid });
        const errorTwiML = TwiMLGenerator.generateErrorTwiML();
        return reply.type('text/xml').send(errorTwiML);
      }

      const processingTime = Date.now() - startTime;
      fastify.log.info('=== SPEECH INPUT COMPLETE ===', { 
        requestId, 
        CallSid, 
        processingTimeMs: processingTime,
        responseLength: responseMessage.length,
        newStep: newConversationStep,
        willContinue: shouldContinue,
        twimlLength: twiml.length,
        totalInteractions: updatedCallState.totalInteractions
      });

      reply.type('text/xml').send(twiml);
      
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      fastify.log.error('=== SPEECH INPUT ERROR ===', {
        error: error.message,
        stack: error.stack,
        CallSid: (request.body as any)?.CallSid,
        SpeechResult: (request.body as any)?.SpeechResult,
        Confidence: (request.body as any)?.Confidence,
        processingTimeMs: processingTime
      });
      
      // Record error in call state if CallSid is available
      const callSid = (request.body as any)?.CallSid;
      if (callSid) {
        await CallStateManager.recordError(callSid, `Gather endpoint error: ${error.message}`);
      }
      
      const errorTwiML = TwiMLGenerator.generateErrorTwiML("Sorry mate, I'm having a bit of trouble right now. Please try again.");
      reply.status(500).type('text/xml').send(errorTwiML);
    }
  });

  /**
   * Call status webhook - Handle call lifecycle events
   */
  fastify.post('/twilio/status', async (request, reply) => {
    try {
      const { CallSid, CallStatus, CallDuration, Direction } = request.body as any;
      
      fastify.log.info('=== CALL STATUS UPDATE ===', { 
        CallSid, 
        CallStatus, 
        CallDuration,
        Direction,
        timestamp: new Date().toISOString()
      });

      if (!CallSid) {
        fastify.log.error('Missing CallSid in status webhook');
        return reply.status(400).send({ error: 'Missing CallSid' });
      }

      // Handle call completion events
      if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(CallStatus)) {
        // End call state
        await CallStateManager.endCall(CallSid);
        
        // End conversation
        await conversationService.endConversation(CallSid);
        
        fastify.log.info('Call ended and state cleaned up', { 
          CallSid, 
          CallStatus,
          CallDuration: CallDuration || 'unknown'
        });
      }

      reply.send({ status: 'ok', received: CallStatus });
      
    } catch (error: any) {
      fastify.log.error('Error handling call status webhook:', {
        error: error.message,
        stack: error.stack,
        body: request.body
      });
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Health check endpoint for call system
   */
  fastify.get('/twilio/health', async (request, reply) => {
    try {
      // Test Redis connectivity
      await CallStateManager.initializeCall('health-check-test');
      await CallStateManager.endCall('health-check-test');
      
      reply.send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          callStateManager: 'up',
          twimlGenerator: 'up',
          conversationService: 'up'
        }
      });
    } catch (error: any) {
      fastify.log.error('Health check failed:', error);
      reply.status(500).send({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
};

export default twilioRobustRoutes;