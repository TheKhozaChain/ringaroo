import { orchestrator } from '../services/orchestrator';

describe('Orchestrator Service', () => {
  const mockCallSid = 'test-call-sid-123';
  const mockCallerNumber = '+61412345678';

  afterEach(async () => {
    // Clean up any test data
    try {
      await orchestrator.endCall(mockCallSid);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initializeCall', () => {
    it('should initialize a new call dialogue', async () => {
      const state = await orchestrator.initializeCall(mockCallSid, mockCallerNumber);

      expect(state.callSid).toBe(mockCallSid);
      expect(state.callerNumber).toBe(mockCallerNumber);
      expect(state.status).toBe('in_progress');
      expect(state.transcript).toHaveLength(0);
      expect(state.context.knowledgeUsed).toHaveLength(0);
      expect(state.startedAt).toBeInstanceOf(Date);
      expect(state.lastActivity).toBeInstanceOf(Date);
    });

    it('should handle calls without caller number', async () => {
      const state = await orchestrator.initializeCall(mockCallSid);

      expect(state.callSid).toBe(mockCallSid);
      expect(state.callerNumber).toBeUndefined();
      expect(state.status).toBe('in_progress');
    });
  });

  describe('processSpeech', () => {
    beforeEach(async () => {
      await orchestrator.initializeCall(mockCallSid, mockCallerNumber);
    });

    it('should process high-confidence speech', async () => {
      const transcript = "Hello, I'd like to book an appointment";
      const confidence = 0.95;

      const response = await orchestrator.processSpeech(mockCallSid, transcript, confidence);

      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
      expect(response).not.toContain("I didn't catch that");
    });

    it('should handle low-confidence speech', async () => {
      const transcript = "mumbled words";
      const confidence = 0.5; // Below threshold

      const response = await orchestrator.processSpeech(mockCallSid, transcript, confidence);

      expect(response).toContain("I didn't catch that");
      expect(response).toContain("Could you please repeat");
    });

    it('should throw error for non-existent call', async () => {
      const nonExistentCallSid = 'non-existent-call-123';
      
      await expect(
        orchestrator.processSpeech(nonExistentCallSid, 'test', 0.9)
      ).rejects.toThrow('No dialogue state found');
    });
  });

  describe('endCall', () => {
    it('should end a call and cleanup state', async () => {
      await orchestrator.initializeCall(mockCallSid, mockCallerNumber);
      
      // Should not throw
      await expect(orchestrator.endCall(mockCallSid)).resolves.not.toThrow();
    });

    it('should handle ending non-existent call gracefully', async () => {
      const nonExistentCallSid = 'non-existent-call-456';
      
      // Should not throw
      await expect(orchestrator.endCall(nonExistentCallSid)).resolves.not.toThrow();
    });
  });
}); 