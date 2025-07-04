import { FastifyPluginAsync } from 'fastify';
import { orchestrator } from '@/services/orchestrator';
import { ttsCacheManager } from '@/services/tts';
import { speechService, AudioFormat } from '@/services/speech';
import { conversationService } from '@/services/conversation';
import { TwiMLGenerator } from '@/services/twiml-generator';
import OpenAI from 'openai';
import { appConfig } from '@/config';
import type { TwilioStreamMessage } from '@/types';

const twilioRoutes: FastifyPluginAsync = async function (fastify) {
  // Incoming call webhook - returns TwiML to start media stream
  fastify.post('/twilio/voice', async (request, reply) => {
    try {
      const { CallSid, From, To } = request.body as any;

      fastify.log.info('Incoming call received', { 
        CallSid, 
        From, 
        To,
        userAgent: request.headers['user-agent'],
        timestamp: new Date().toISOString()
      });

      // Validate required parameters
      if (!CallSid) {
        fastify.log.error('Missing CallSid in webhook request');
        return reply.status(400).send({ error: 'Missing CallSid' });
      }

      // Initialize conversation with GPT-4 integration
      await conversationService.initializeConversation(CallSid, From);
      fastify.log.info('Conversation initialized', { CallSid, From });

      // Return TwiML with speech recognition using OpenAI TTS
      const webhookUrl = `https://${request.headers.host}`;
      const gatherUrl = webhookUrl + '/twilio/gather';
      
      // Use exact cached OpenAI TTS greeting (line 631 shows it's cached)
      const greetingMessage = "G'day! Thanks for calling. I'm Johnno, your AI assistant. How can I help you today?";
      const greetingAudio = await ttsCacheManager.getAudioElement(greetingMessage, CallSid);
      
      // Simplified TwiML with more robust timeouts
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="2" action="${gatherUrl}">
        ${greetingAudio}
    </Gather>
    <Redirect>${gatherUrl}</Redirect>
</Response>`;

      fastify.log.debug('Sending TwiML response', { CallSid });
      reply.type('text/xml').send(twiml);
    } catch (error: any) {
      fastify.log.error('Error handling incoming call:', {
        error: error.message,
        stack: error.stack,
        CallSid: (request.body as any)?.CallSid,
        From: (request.body as any)?.From,
        To: (request.body as any)?.To
      });
      
      // FORCE 100% OpenAI TTS - NEVER return JSON error, ALWAYS return TwiML
      console.log('🚨 CRITICAL: Route error - forcing OpenAI TTS or hangup to prevent Twilio voice fallback');
      try {
        const errorTwiml = TwiMLGenerator.generateErrorTwiML("Sorry, we're experiencing technical difficulties. Please try calling back later.");
        reply.status(200).type('text/xml').send(errorTwiml);
      } catch (twimlError) {
        // Last resort - hang up immediately to prevent any Twilio voice
        console.log('🚨 EMERGENCY: TwiML generation failed - hanging up to maintain 100% OpenAI TTS requirement');
        reply.status(200).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
      }
    }
  });

  // Call status webhook
  fastify.post('/twilio/status', async (request, reply) => {
    try {
      const { CallSid, CallStatus, CallDuration, Direction } = request.body as any;
      
      fastify.log.info('Call status update received', { 
        CallSid, 
        CallStatus, 
        CallDuration,
        Direction,
        timestamp: new Date().toISOString()
      });

      // Validate CallSid
      if (!CallSid) {
        fastify.log.error('Missing CallSid in status webhook');
        return reply.status(400).send({ error: 'Missing CallSid' });
      }

      // Handle call completion
      if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
        await orchestrator.endCall(CallSid);
        await conversationService.endConversation(CallSid);
        fastify.log.info('Call ended and state cleaned up', { CallSid, CallStatus });
      }

      reply.send({ status: 'ok', received: CallStatus });
    } catch (error) {
      fastify.log.error('Error handling call status webhook:', error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Handle speech input from caller with GPT-4 intelligence
  fastify.post('/twilio/gather', async (request, reply) => {
    // FORCE 100% OpenAI TTS - wrap everything in try/catch to prevent ANY Twilio fallbacks
    try {
      const { CallSid, SpeechResult, Confidence } = request.body as any;
      
      fastify.log.info('Speech input received', { 
        CallSid, 
        SpeechResult, 
        Confidence 
      });

      let responseText = "I didn't quite catch that. Could you try speaking a bit louder or slower?";
      let continueConversation = true;
      
      if (SpeechResult && parseFloat(Confidence || '0') > 0.3) {
        try {
          // Use conversation service for GPT-4 powered responses
          const gptResponse = await conversationService.processUserInput(
            CallSid, 
            SpeechResult, 
            parseFloat(Confidence || '1.0')
          );
          
          responseText = gptResponse.message;
          
          // Log GPT response details
          fastify.log.info('GPT-4 response generated', {
            CallSid,
            SpeechResult,
            intent: gptResponse.intent,
            confidence: gptResponse.confidence,
            tokenUsage: gptResponse.tokenUsage
          });
          
          // Check if conversation should end
          if (gptResponse.intent === 'goodbye') {
            continueConversation = false;
          }
          
        } catch (gptError: any) {
          console.error('DETAILED ERROR:', gptError);
          fastify.log.error('Conversation service error:', {
            error: gptError.message,
            stack: gptError.stack,
            name: gptError.name,
            code: gptError.code,
            CallSid,
            SpeechResult,
            Confidence
          });
          
          // Fallback to simple response
          responseText = "No worries mate! I'm here to help. Could you tell me what you need?";
        }
      }
      
      // Continue the conversation or end it
      const webhookUrl = process.env.WEBHOOK_BASE_URL || `https://${request.headers.host}`;
      const gatherUrl = webhookUrl + '/twilio/gather';
      
      let responseTwiml;
      
      if (continueConversation) {
        // Generate OpenAI TTS for the response
        const responseAudio = await ttsCacheManager.getAudioElement(responseText, CallSid);
        
        // Only add follow-up prompt if the response doesn't already include a question
        const hasQuestion = responseText.includes('?') || responseText.toLowerCase().includes('can i') || responseText.toLowerCase().includes('would you like');
        
        if (hasQuestion) {
          // Response already has a question, just listen for answer
          responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="6" speechTimeout="1.2" action="${gatherUrl}">
        ${responseAudio}
        <Pause length="0.2"/>
    </Gather>
    <Redirect>${gatherUrl}</Redirect>
</Response>`;
        } else {
          // Response is a statement, add a subtle follow-up
          responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    ${responseAudio}
    <Gather input="speech" timeout="6" speechTimeout="1.2" action="${gatherUrl}">
        <Pause length="0.2"/>
    </Gather>
    <Redirect>${gatherUrl}</Redirect>
</Response>`;
        }
      } else {
        // Final response without expecting more input
        const responseAudio = await ttsCacheManager.getAudioElement(responseText, CallSid);
        const goodbyeAudio = await ttsCacheManager.getAudioElement("Thanks for calling! Have a great day!", CallSid);
        
        responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    ${responseAudio}
    <Pause length="1"/>
    ${goodbyeAudio}
    <Hangup/>
</Response>`;
      }
      
      reply.type('text/xml').send(responseTwiml);
      
    } catch (error: any) {
      const { CallSid, SpeechResult, Confidence } = request.body as any;
      fastify.log.error('Error in gather endpoint:', {
        error: error.message,
        stack: error.stack,
        CallSid,
        SpeechResult,
        Confidence
      });
      
      // FORCE 100% OpenAI TTS - NEVER return JSON error, ALWAYS return TwiML
      console.log('🚨 CRITICAL: Gather endpoint error - forcing OpenAI TTS or hangup to prevent Twilio voice fallback');
      try {
        const errorTwiml = TwiMLGenerator.generateErrorTwiML("Sorry mate, I'm having a bit of trouble right now. Please try again.");
        reply.status(200).type('text/xml').send(errorTwiml);
      } catch (twimlError) {
        // Last resort - hang up immediately to prevent any Twilio voice
        console.log('🚨 EMERGENCY: TwiML generation failed - hanging up to maintain 100% OpenAI TTS requirement');
        reply.status(200).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
      }
    }
  });

  // WebSocket handler for media streams (keeping for future use)
  fastify.register(async function (fastify) {
    fastify.get('/twilio/stream', { websocket: true }, (socket, request) => {
      let callSid: string | null = null;
      let audioBuffer = '';
      let streamSid: string | null = null;
      let lastActivity = Date.now();
      let silenceTimer: NodeJS.Timeout | null = null;
      let isProcessingAudio = false;
      
      // Audio processing configuration
      const AUDIO_CHUNK_SIZE = 16000; // ~2 seconds at 8kHz
      const SILENCE_TIMEOUT = 2000; // 2 seconds of silence before processing
      const MIN_AUDIO_LENGTH = 4000; // Minimum audio length to process (~500ms)

      // Connection timeout handler
      const timeoutHandler = setInterval(() => {
        if (Date.now() - lastActivity > 60000) { // 60 second timeout
          fastify.log.warn('WebSocket connection timeout', { callSid, streamSid });
          socket.close(1000, 'Connection timeout');
        }
      }, 10000);

      socket.on('message', async (message: Buffer) => {
        try {
          lastActivity = Date.now();
          const data: TwilioStreamMessage = JSON.parse(message.toString());

          fastify.log.debug('WebSocket message received', { 
            event: data.event, 
            callSid, 
            sequenceNumber: data.sequenceNumber 
          });

          switch (data.event) {
            case 'connected':
              fastify.log.info('WebSocket connected', { 
                remoteAddress: request.socket.remoteAddress,
                userAgent: request.headers['user-agent']
              });
              break;

            case 'start':
              callSid = data.start?.callSid || null;
              streamSid = data.start?.streamSid || null;
              
              fastify.log.info('Media stream started', { 
                callSid, 
                streamSid,
                tracks: data.start?.tracks,
                mediaFormat: data.start?.mediaFormat 
              });
              
              // Send initial greeting
              if (callSid) {
                const greeting = "G'day! Thanks for calling. I'm Johnno, your AI assistant. How can I help you today?";
                await sendTTSToCall(fastify, socket, greeting);
              }
              break;

            case 'media':
              if (data.media && callSid && data.media.track === 'inbound') {
                // Accumulate audio data
                audioBuffer += data.media.payload;
                
                // Reset silence timer - we're receiving audio
                if (silenceTimer) {
                  clearTimeout(silenceTimer);
                  silenceTimer = null;
                }
                
                // Process immediately if buffer is large enough
                if (audioBuffer.length > AUDIO_CHUNK_SIZE && !isProcessingAudio) {
                  await processAudioBuffer(fastify, socket, callSid, audioBuffer);
                }
                
                // Set silence timer to process remaining audio after silence
                silenceTimer = setTimeout(async () => {
                  if (audioBuffer.length > MIN_AUDIO_LENGTH && !isProcessingAudio && callSid) {
                    await processAudioBuffer(fastify, socket, callSid, audioBuffer);
                  }
                }, SILENCE_TIMEOUT);
              }
              break;

            case 'stop':
              fastify.log.info('Media stream stopped', { 
                callSid, 
                streamSid,
                accountSid: data.stop?.accountSid 
              });
              if (callSid) {
                await orchestrator.endCall(callSid);
              }
              break;

            default:
              fastify.log.warn('Unknown WebSocket event', { event: data.event, callSid });
          }
        } catch (error: any) {
          fastify.log.error('WebSocket message processing error:', {
            error: error.message,
            stack: error.stack,
            callSid,
            messageLength: message.length
          });
        }
      });

      // Helper function to process audio buffer
      async function processAudioBuffer(fastifyInstance: any, socket: any, callSid: string, buffer: string) {
        if (isProcessingAudio) return;
        
        isProcessingAudio = true;
        audioBuffer = ''; // Clear buffer immediately to prevent duplicate processing
        
        try {
          const audioData = Buffer.from(buffer, 'base64');
          const result = await speechService.transcribe(audioData, AudioFormat.MULAW_8KHZ);
          
          if (result.text && result.confidence > 0.3) {
            fastifyInstance.log.debug('Audio transcribed', { 
              callSid, 
              transcript: result.text, 
              confidence: result.confidence 
            });
            
            const response = await orchestrator.processSpeech(callSid, result.text, result.confidence);
            await sendTTSToCall(fastifyInstance, socket, response);
          } else {
            fastifyInstance.log.debug('Low confidence or empty transcription', { 
              callSid, 
              confidence: result.confidence 
            });
          }
        } catch (error) {
          fastifyInstance.log.error('Audio processing error:', error);
        } finally {
          isProcessingAudio = false;
        }
      }

      socket.on('close', (code: number, reason: Buffer) => {
        clearInterval(timeoutHandler);
        if (silenceTimer) {
          clearTimeout(silenceTimer);
        }
        
        fastify.log.info('WebSocket connection closed', { 
          callSid, 
          streamSid,
          code, 
          reason: reason.toString() 
        });
        
        if (callSid) {
          orchestrator.endCall(callSid).catch((error) => {
            fastify.log.error('Error ending call on socket close:', error);
          });
        }
      });

      socket.on('error', (error: Error) => {
        clearInterval(timeoutHandler);
        if (silenceTimer) {
          clearTimeout(silenceTimer);
        }
        
        fastify.log.error('WebSocket error:', {
          error: error.message,
          stack: error.stack,
          callSid,
          streamSid
        });
      });
    });
  });
};


// Enhanced TTS function using OpenAI TTS for Media Streams
async function sendTTSToCall(fastifyInstance: any, socket: any, text: string): Promise<void> {
  try {
    fastifyInstance.log.info('Sending TTS response:', { text });
    
    // Use OpenAI TTS to generate audio
    if (appConfig.openaiApiKey && appConfig.openaiApiKey !== 'sk-demo-key-for-testing') {
      try {
        const openai = new OpenAI({ apiKey: appConfig.openaiApiKey });
        
        const response = await openai.audio.speech.create({
          model: 'tts-1',
          voice: 'nova', // Clear, Australian-friendly voice
          input: text,
          response_format: 'mp3',
        });
        
        const audioBuffer = Buffer.from(await response.arrayBuffer());
        
        // Convert to μ-law format for Twilio (simplified approach)
        // For now, send as base64 encoded audio
        const audioBase64 = audioBuffer.toString('base64');
        
        // Send audio in chunks suitable for Twilio Media Stream
        const chunkSize = 320; // Small chunks for real-time streaming
        for (let i = 0; i < audioBase64.length; i += chunkSize) {
          const chunk = audioBase64.slice(i, i + chunkSize);
          const mediaMessage = {
            event: 'media',
            streamSid: 'audio-stream',
            media: {
              track: 'outbound',
              chunk: Math.floor(i / chunkSize).toString(),
              timestamp: Date.now().toString(),
              payload: chunk
            }
          };
          socket.send(JSON.stringify(mediaMessage));
          
          // Small delay to avoid overwhelming the stream
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        
        fastifyInstance.log.debug('OpenAI TTS audio sent successfully');
        return;
        
      } catch (ttsError) {
        fastifyInstance.log.warn('OpenAI TTS failed, using fallback:', ttsError);
      }
    }
    
    // Fallback: Log the text (user will see in server logs)
    fastifyInstance.log.info('TTS RESPONSE (audio not configured):', { text });
    console.log(`🗣️  JOHNNO SAYS: "${text}"`);
    
  } catch (error) {
    fastifyInstance.log.error('TTS error:', error);
  }
}


export default twilioRoutes; 