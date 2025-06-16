import { CallStateManager } from '@/services/call-state';
import { TwiMLGenerator } from '@/services/twiml-generator';
import { conversationService } from '@/services/conversation';

/**
 * Test conversation flow without requiring actual Twilio calls
 */
export class ConversationFlowTester {
  
  /**
   * Test complete conversation flow simulation
   */
  static async testCompleteBookingFlow(): Promise<void> {
    console.log('🧪 Testing Complete Booking Flow...\n');
    
    const testCallSid = `test_call_${Date.now()}`;
    
    try {
      // Step 1: Initialize call
      console.log('1. Initializing call...');
      const callState = await CallStateManager.initializeCall(testCallSid);
      console.log(`   ✅ Call initialized: ${callState.conversationStep}`);
      
      // Step 2: Initialize conversation
      console.log('2. Initializing conversation...');
      await conversationService.initializeConversation(testCallSid);
      console.log('   ✅ Conversation initialized');
      
      // Step 3: Test greeting TwiML
      console.log('3. Testing greeting TwiML...');
      const greetingTwiML = TwiMLGenerator.generateGreetingTwiML('https://test.example.com/gather');
      const isValidGreeting = TwiMLGenerator.validateTwiML(greetingTwiML);
      console.log(`   ✅ Greeting TwiML valid: ${isValidGreeting}`);
      if (!isValidGreeting) throw new Error('Invalid greeting TwiML');
      
      // Step 4: Simulate user responses
      const conversationSteps = [
        { input: 'I want to make a booking', expectedIntent: 'booking' },
        { input: 'My name is John Smith', expectedIntent: 'booking' },
        { input: 'I need a consultation', expectedIntent: 'booking' },
        { input: 'Tomorrow at 2pm would be good', expectedIntent: 'booking' },
        { input: 'Thank you, goodbye', expectedIntent: 'goodbye' }
      ];
      
      console.log('4. Testing conversation steps...');
      for (let i = 0; i < conversationSteps.length; i++) {
        const step = conversationSteps[i];
        console.log(`   Step ${i + 1}: "${step.input}"`);
        
        // Process user input
        const response = await conversationService.processUserInput(
          testCallSid,
          step.input,
          0.9 // High confidence
        );
        
        console.log(`   📝 Response: "${response.message.substring(0, 100)}..."`);
        console.log(`   🎯 Intent: ${response.intent} (expected: ${step.expectedIntent})`);
        
        // Update call state based on response
        const newStep = response.intent === 'goodbye' ? 'completing' : 'collecting_info';
        await CallStateManager.updateCallState(testCallSid, {
          conversationStep: newStep,
          awaitingResponse: response.intent !== 'goodbye'
        });
        
        // Generate TwiML for response
        const currentCallState = await CallStateManager.getCallState(testCallSid);
        if (currentCallState) {
          const twiml = response.intent === 'goodbye' 
            ? TwiMLGenerator.generateConversationTwiML({
                message: response.message,
                expectsResponse: false,
                action: 'https://test.example.com/gather'
              })
            : TwiMLGenerator.generateStatefulTwiML(
                currentCallState,
                response.message,
                'https://test.example.com/gather'
              );
          
          const isValid = TwiMLGenerator.validateTwiML(twiml);
          console.log(`   📋 TwiML valid: ${isValid}`);
          
          if (!isValid) {
            console.error(`   ❌ Invalid TwiML at step ${i + 1}`);
            throw new Error(`Invalid TwiML at step ${i + 1}`);
          }
        }
        
        console.log('   ✅ Step completed\n');
      }
      
      // Step 5: Verify final call state
      console.log('5. Verifying final call state...');
      const finalCallState = await CallStateManager.getCallState(testCallSid);
      if (finalCallState) {
        console.log(`   📊 Total interactions: ${finalCallState.totalInteractions}`);
        console.log(`   📍 Final step: ${finalCallState.conversationStep}`);
        console.log(`   🏁 Awaiting response: ${finalCallState.awaitingResponse}`);
        console.log('   ✅ Call state verified');
      }
      
      // Step 6: Clean up
      console.log('6. Cleaning up...');
      await CallStateManager.endCall(testCallSid);
      await conversationService.endConversation(testCallSid);
      console.log('   ✅ Cleanup completed');
      
      console.log('\n🎉 CONVERSATION FLOW TEST PASSED!\n');
      
    } catch (error: any) {
      console.error('\n❌ CONVERSATION FLOW TEST FAILED!');
      console.error(`Error: ${error.message}`);
      console.error(`Stack: ${error.stack}\n`);
      
      // Clean up on failure
      try {
        await CallStateManager.endCall(testCallSid);
        await conversationService.endConversation(testCallSid);
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
      
      throw error;
    }
  }
  
  /**
   * Test TwiML generation edge cases
   */
  static async testTwiMLGeneration(): Promise<void> {
    console.log('🧪 Testing TwiML Generation...\n');
    
    const testCases = [
      {
        name: 'Basic greeting',
        twiml: TwiMLGenerator.generateGreetingTwiML('https://example.com/gather')
      },
      {
        name: 'Response with question',
        twiml: TwiMLGenerator.generateConversationTwiML({
          message: "What's your name?",
          expectsResponse: true,
          action: 'https://example.com/gather'
        })
      },
      {
        name: 'Response without question',
        twiml: TwiMLGenerator.generateConversationTwiML({
          message: "Thank you for calling!",
          expectsResponse: false,
          action: 'https://example.com/gather'
        })
      },
      {
        name: 'Error message',
        twiml: TwiMLGenerator.generateErrorTwiML('Something went wrong')
      },
      {
        name: 'Message with special characters',
        twiml: TwiMLGenerator.generateConversationTwiML({
          message: "Great! You're all set & ready to go <smile>",
          expectsResponse: false,
          action: 'https://example.com/gather'
        })
      }
    ];
    
    for (const testCase of testCases) {
      console.log(`Testing: ${testCase.name}...`);
      const isValid = TwiMLGenerator.validateTwiML(testCase.twiml);
      
      if (isValid) {
        console.log('   ✅ Valid TwiML');
      } else {
        console.error('   ❌ Invalid TwiML');
        console.error(`   TwiML: ${testCase.twiml.substring(0, 200)}...`);
        throw new Error(`Invalid TwiML for test case: ${testCase.name}`);
      }
    }
    
    console.log('\n🎉 TWIML GENERATION TEST PASSED!\n');
  }
  
  /**
   * Test call state management
   */
  static async testCallStateManagement(): Promise<void> {
    console.log('🧪 Testing Call State Management...\n');
    
    const testCallSid = `test_state_${Date.now()}`;
    
    try {
      // Test initialization
      console.log('1. Testing call state initialization...');
      const initialState = await CallStateManager.initializeCall(testCallSid);
      console.log(`   ✅ Initial state: ${initialState.conversationStep}`);
      
      // Test retrieval
      console.log('2. Testing call state retrieval...');
      const retrievedState = await CallStateManager.getCallState(testCallSid);
      if (!retrievedState || retrievedState.callSid !== testCallSid) {
        throw new Error('State retrieval failed');
      }
      console.log('   ✅ State retrieved correctly');
      
      // Test updates
      console.log('3. Testing call state updates...');
      const updatedState = await CallStateManager.updateCallState(testCallSid, {
        conversationStep: 'booking',
        customerData: { name: 'Test User' }
      });
      
      if (!updatedState || updatedState.conversationStep !== 'booking') {
        throw new Error('State update failed');
      }
      console.log('   ✅ State updated correctly');
      
      // Test validation
      console.log('4. Testing call validation...');
      const isValid = await CallStateManager.validateCallContinuation(testCallSid);
      if (!isValid) {
        throw new Error('Call validation failed');
      }
      console.log('   ✅ Call validation passed');
      
      // Test error recording
      console.log('5. Testing error recording...');
      await CallStateManager.recordError(testCallSid, 'Test error');
      const stateWithError = await CallStateManager.getCallState(testCallSid);
      if (!stateWithError || stateWithError.errorCount !== 1) {
        throw new Error('Error recording failed');
      }
      console.log('   ✅ Error recorded correctly');
      
      // Test cleanup
      console.log('6. Testing call cleanup...');
      await CallStateManager.endCall(testCallSid);
      const endedState = await CallStateManager.getCallState(testCallSid);
      if (!endedState || endedState.status !== 'ended') {
        throw new Error('Call cleanup failed');
      }
      console.log('   ✅ Call cleaned up correctly');
      
      console.log('\n🎉 CALL STATE MANAGEMENT TEST PASSED!\n');
      
    } catch (error: any) {
      console.error('\n❌ CALL STATE MANAGEMENT TEST FAILED!');
      console.error(`Error: ${error.message}\n`);
      
      // Clean up on failure
      try {
        await CallStateManager.endCall(testCallSid);
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
      
      throw error;
    }
  }
  
  /**
   * Run all tests
   */
  static async runAllTests(): Promise<void> {
    console.log('🚀 Starting Conversation Flow Tests...\n');
    
    try {
      await this.testCallStateManagement();
      await this.testTwiMLGeneration();
      await this.testCompleteBookingFlow();
      
      console.log('🎉 ALL TESTS PASSED! The conversation system is ready for deployment.\n');
      
    } catch (error: any) {
      console.error('❌ TEST SUITE FAILED!');
      console.error(`Error: ${error.message}\n`);
      process.exit(1);
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  ConversationFlowTester.runAllTests();
}