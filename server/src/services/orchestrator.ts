import OpenAI from 'openai';
import { db } from './database';
import { redis } from './redis';
import { appConfig } from '@/config';
import type {
  DialogueState,
  TranscriptEntry,
  GPTResponse,
  ActionType,
  ConversationContext,
  Tenant,
  KnowledgeChunk,
} from '@/types';

class OrchestratorService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: appConfig.openaiApiKey,
    });
  }

  /**
   * Initialize a new call dialogue
   */
  async initializeCall(callSid: string, callerNumber?: string): Promise<DialogueState> {
    const initialState: DialogueState = {
      callSid,
      tenantId: process.env.DEMO_TENANT_ID || '550e8400-e29b-41d4-a716-446655440000',
      callerNumber,
      transcript: [],
      context: {
        knowledgeUsed: [],
      },
      status: 'in_progress',
      startedAt: new Date(),
      lastActivity: new Date(),
    };

    await redis.setDialogueState(callSid, initialState);

    // Create call record in database
    await db.createCall({
      tenantId: initialState.tenantId,
      twilioCallSid: callSid,
      callerNumber,
      status: 'in_progress',
      transcript: [],
      actions: [],
      startedAt: new Date(),
    });

    return initialState;
  }

  /**
   * Process incoming speech from caller
   */
  async processSpeech(callSid: string, transcript: string, confidence: number): Promise<string> {
    const state = await redis.getDialogueState(callSid);
    if (!state) {
      throw new Error(`No dialogue state found for call ${callSid}`);
    }

    // Check confidence threshold
    if (confidence < appConfig.asrConfidenceThreshold) {
      return "I'm sorry, I didn't catch that. Could you please repeat?";
    }

    // Add caller's speech to transcript
    const transcriptEntry: TranscriptEntry = {
      speaker: 'caller',
      text: transcript,
      timestamp: new Date(),
      confidence,
    };

    state.transcript.push(transcriptEntry);
    state.lastActivity = new Date();

    // Get response from GPT-4o
    const gptResponse = await this.generateResponse(state);

    // Add Johnno's response to transcript
    const johnnoEntry: TranscriptEntry = {
      speaker: 'johnno',
      text: gptResponse.message,
      timestamp: new Date(),
    };

    state.transcript.push(johnnoEntry);

    // Execute any actions
    if (gptResponse.action && gptResponse.action !== 'CONTINUE') {
      await this.executeAction(state, gptResponse.action, gptResponse.actionParameters || {});
    }

    // Update state in Redis
    await redis.setDialogueState(callSid, state);

    return gptResponse.message;
  }

  /**
   * Generate response using GPT-4o with knowledge base and context
   */
  private async generateResponse(state: DialogueState): Promise<GPTResponse> {
    const systemPrompt = `You are Johnno, a friendly Australian AI receptionist. Keep responses under 50 words. Use Australian expressions like "no worries", "mate". For bookings, gather name, phone, service type, and preferred time.`;
    
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...state.transcript.slice(-6).map(t => ({
        role: t.speaker === 'caller' ? 'user' as const : 'assistant' as const,
        content: t.text,
      })),
    ];

    try {
      const completion = await this.openai.chat.completions.create({
        model: appConfig.openaiModel,
        messages,
        temperature: 0.7,
        max_tokens: 150,
      });

      return {
        message: completion.choices[0]?.message?.content || "G'day! How can I help you today?",
        action: 'CONTINUE',
        confidence: 0.8,
      };
    } catch (error) {
      return {
        message: "Sorry mate, having a bit of trouble. Let me get someone to help you.",
        action: 'ESCALATE',
        confidence: 0.1,
      };
    }
  }

  /**
   * Execute actions returned by GPT
   */
  private async executeAction(
    state: DialogueState,
    action: ActionType,
    parameters: Record<string, unknown>
  ): Promise<void> {
    try {
      switch (action) {
        case 'BOOK':
          await this.handleBookingAction(state, parameters);
          break;
        case 'EMAIL_OWNER':
          await this.handleEmailOwnerAction(state, parameters);
          break;
        case 'ESCALATE':
          await this.handleEscalateAction(state, parameters);
          break;
        case 'CONTINUE':
          // No action needed
          break;
      }

      // Log the action
      const actionRecord = {
        type: action,
        parameters,
        timestamp: new Date(),
        success: true,
      };

      // Update call record
      const call = await db.getCallByTwilioSid(state.callSid);
      if (call) {
        await db.updateCall(call.id, {
          actions: [...call.actions, actionRecord],
        });
      }
    } catch (error) {
      console.error(`Error executing action ${action}:`, error);
      // Log failed action
      const actionRecord = {
        type: action,
        parameters,
        timestamp: new Date(),
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };

      const call = await db.getCallByTwilioSid(state.callSid);
      if (call) {
        await db.updateCall(call.id, {
          actions: [...call.actions, actionRecord],
        });
      }
    }
  }

  /**
   * Handle booking action
   */
  private async handleBookingAction(
    state: DialogueState,
    parameters: Record<string, unknown>
  ): Promise<void> {
    const booking = {
      tenantId: state.tenantId,
      callId: state.callSid,
      customerName: parameters.customerName as string,
      customerPhone: parameters.customerPhone as string || state.callerNumber,
      customerEmail: parameters.customerEmail as string,
      serviceType: parameters.serviceType as string,
      preferredDate: parameters.preferredDate ? new Date(parameters.preferredDate as string) : undefined,
      preferredTime: parameters.preferredTime as string,
      notes: parameters.notes as string,
      status: 'pending' as const,
    };

    await db.createBooking(booking);
    
    // Update conversation context
    state.context.intent = 'booking';
    state.context.customerName = booking.customerName;
    state.context.customerPhone = booking.customerPhone;
    state.context.customerEmail = booking.customerEmail;
  }

  /**
   * Handle email owner action
   */
  private async handleEmailOwnerAction(
    state: DialogueState,
    parameters: Record<string, unknown>
  ): Promise<void> {
    // This would integrate with an email service
    console.log('EMAIL_OWNER action triggered:', parameters);
    // TODO: Implement email service integration
  }

  /**
   * Handle escalate action
   */
  private async handleEscalateAction(
    state: DialogueState,
    parameters: Record<string, unknown>
  ): Promise<void> {
    state.status = 'transferred';
    state.context.transferReason = parameters.reason as string || 'Customer requested human assistance';
    
    // Update call status
    const call = await db.getCallByTwilioSid(state.callSid);
    if (call) {
      await db.updateCall(call.id, { status: 'transferred' });
    }
  }

  /**
   * End call and cleanup
   */
  async endCall(callSid: string): Promise<void> {
    const state = await redis.getDialogueState(callSid);
    if (state) {
      state.status = 'completed';
      
      // Update call record
      const call = await db.getCallByTwilioSid(callSid);
      if (call) {
        await db.updateCall(call.id, {
          status: 'completed',
          transcript: state.transcript,
          endedAt: new Date(),
        });
      }

      // Clean up Redis state
      await redis.deleteDialogueState(callSid);
      await redis.clearAudioBuffer(callSid);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test OpenAI API
      await this.openai.models.list();
      return true;
    } catch {
      return false;
    }
  }
}

export const orchestrator = new OrchestratorService();
export default OrchestratorService; 