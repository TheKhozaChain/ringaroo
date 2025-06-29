# Ringaroo Demo Test Script

This script outlines a simple, natural conversation flow to test the AI receptionist's core functionality.

## Scenario 1: Simple Inquiry & Name Capture

**Objective**: Verify that the system can handle a simple inquiry, ask for the caller's name when it's not provided, and then continue the conversation naturally.

**Steps**:

1.  **Caller**: Dials the Ringaroo phone number `+61 2 5944 5971`.
2.  **AI Assistant (Johnno)**: "G'day! Thanks for calling Pest Blitz. I'm Johnno, your AI assistant. How can I help you today?"
3.  **Caller**: "Hi, I have a question about your services."
4.  **AI Assistant (Johnno)**: "Thanks for calling! Can I get your name please?"
5.  **Caller**: "My name is Curtis."
6.  **AI Assistant (Johnno)**: "Thanks, Curtis. No worries, I can help with that. What's your question about our services?"
7.  **Caller**: "Do you handle termite inspections?"
8.  **AI Assistant (Johnno)**: "Yes, we certainly do. We offer comprehensive termite inspections and treatments. Would you like to book one?"
9.  **Caller**: "Not right now, thanks."
10. **AI Assistant (Johnno)**: "No worries, mate. Is there anything else I can help you with today?"
11. **Caller**: "No, that's all."
12. **AI Assistant (Johnno)**: "Alright, thanks for your call. Have a great day!"

## Expected Behavior:

*   The AI should initiate the conversation with a friendly, branded greeting.
*   When the caller doesn't provide their name, the AI should politely ask for it.
*   The AI should correctly extract the name "Curtis" from the caller's response.
*   The conversation should flow naturally, with the AI remembering the caller's name and the context of the conversation.
*   The AI should be able to answer questions based on its knowledge base.
*   The AI should handle the end of the conversation gracefully.