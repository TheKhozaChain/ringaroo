import { redis } from './redis';

export interface CallState {
  callSid: string;
  status: 'active' | 'ended';
  conversationStep: 'greeting' | 'collecting_info' | 'processing_request' | 'booking' | 'completing';
  lastActivity: Date;
  totalInteractions: number;
  currentQuestion?: string;
  awaitingResponse: boolean;
  conversationContext: string;
  customerData: Record<string, any>;
  bookingData?: Record<string, any>;
  errorCount: number;
  maxRetries: number;
}

export class CallStateManager {
  private static readonly CALL_STATE_TTL = 3600; // 1 hour
  private static readonly MAX_ERROR_COUNT = 3;

  /**
   * Initialize a new call state
   */
  static async initializeCall(callSid: string): Promise<CallState> {
    const callState: CallState = {
      callSid,
      status: 'active',
      conversationStep: 'greeting',
      lastActivity: new Date(),
      totalInteractions: 0,
      awaitingResponse: true,
      conversationContext: 'initial_greeting',
      customerData: {},
      errorCount: 0,
      maxRetries: this.MAX_ERROR_COUNT
    };

    await redis.set(`call_state:${callSid}`, JSON.stringify(callState), this.CALL_STATE_TTL);
    return callState;
  }

  /**
   * Get existing call state with validation
   */
  static async getCallState(callSid: string): Promise<CallState | null> {
    const data = await redis.get(`call_state:${callSid}`);
    if (!data) return null;

    const state = typeof data === 'string' ? JSON.parse(data) : data;
    
    // Validate call state integrity
    if (!state.callSid || state.callSid !== callSid) {
      console.error(`Call state mismatch: expected ${callSid}, got ${state.callSid}`);
      return null;
    }

    // Convert date strings back to Date objects
    state.lastActivity = new Date(state.lastActivity);
    
    return state;
  }

  /**
   * Update call state with activity tracking
   */
  static async updateCallState(callSid: string, updates: Partial<CallState>): Promise<CallState | null> {
    const currentState = await this.getCallState(callSid);
    if (!currentState) {
      console.error(`Cannot update non-existent call state: ${callSid}`);
      return null;
    }

    const updatedState: CallState = {
      ...currentState,
      ...updates,
      lastActivity: new Date(),
      totalInteractions: currentState.totalInteractions + (updates.conversationStep ? 1 : 0)
    };

    await redis.set(`call_state:${callSid}`, JSON.stringify(updatedState), this.CALL_STATE_TTL);
    return updatedState;
  }

  /**
   * Mark call as ended and cleanup
   */
  static async endCall(callSid: string): Promise<void> {
    const state = await this.getCallState(callSid);
    if (state) {
      state.status = 'ended';
      state.awaitingResponse = false;
      await redis.set(`call_state:${callSid}`, JSON.stringify(state), 300); // Keep for 5 mins for debugging
    }
  }

  /**
   * Validate if call should continue processing
   */
  static async validateCallContinuation(callSid: string): Promise<boolean> {
    const state = await this.getCallState(callSid);
    if (!state) return false;
    
    if (state.status !== 'active') return false;
    if (state.errorCount >= state.maxRetries) return false;
    
    // Check if call is too old (more than 1 hour)
    const timeSinceStart = Date.now() - state.lastActivity.getTime();
    if (timeSinceStart > 3600000) return false; // 1 hour
    
    return true;
  }

  /**
   * Increment error count for call
   */
  static async recordError(callSid: string, error: string): Promise<CallState | null> {
    const state = await this.getCallState(callSid);
    if (!state) return null;

    state.errorCount += 1;
    state.lastActivity = new Date();
    
    console.error(`Call error ${state.errorCount}/${state.maxRetries} for ${callSid}: ${error}`);
    
    if (state.errorCount >= state.maxRetries) {
      state.status = 'ended';
      state.awaitingResponse = false;
      console.error(`Call ${callSid} ended due to too many errors`);
    }

    await redis.set(`call_state:${callSid}`, JSON.stringify(state), this.CALL_STATE_TTL);
    return state;
  }

  /**
   * Check if call is expecting a response
   */
  static async isAwaitingResponse(callSid: string): Promise<boolean> {
    const state = await this.getCallState(callSid);
    return state ? state.awaitingResponse : false;
  }

  /**
   * Set what the call is currently waiting for
   */
  static async setAwaitingResponse(callSid: string, awaitingResponse: boolean, context?: string): Promise<void> {
    await this.updateCallState(callSid, {
      awaitingResponse,
      conversationContext: context || 'waiting_for_input'
    });
  }
}