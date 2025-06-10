import { FastifyPluginAsync } from 'fastify';
import { orchestrator } from '@/services/orchestrator';
import { ttsService } from '@/services/tts';
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

      // Initialize dialogue state
      await orchestrator.initializeCall(CallSid, From);
      fastify.log.info('Dialogue state initialized', { CallSid });

      // Return TwiML to start media stream
      const streamUrl = `wss://${request.headers.host}/twilio/stream`;
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="${streamUrl}" />
    </Connect>
    <Say voice="alice" language="en-AU">
        G'day! You've reached our AI assistant. Please hold on while I connect you.
    </Say>
</Response>`;

      fastify.log.debug('Sending TwiML response', { CallSid, streamUrl });
      reply.type('text/xml').send(twiml);
    } catch (error) {
      fastify.log.error('Error handling incoming call:', error);
      
      // Return error TwiML
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-AU">
        Sorry, we're experiencing technical difficulties. Please try calling back later.
    </Say>
    <Hangup />
</Response>`;
      
      reply.status(500).type('text/xml').send(errorTwiml);
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
        fastify.log.info('Call ended and state cleaned up', { CallSid, CallStatus });
      }

      reply.send({ status: 'ok', received: CallStatus });
    } catch (error) {
      fastify.log.error('Error handling call status webhook:', error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // WebSocket handler for media streams
  fastify.register(async function (fastify) {
    fastify.get('/twilio/stream', { websocket: true }, (socket, request) => {
      let callSid: string | null = null;
      let audioBuffer = '';
      let streamSid: string | null = null;
      let lastActivity = Date.now();

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
                
                // Process when we have enough audio (simple approach for demo)
                if (audioBuffer.length > 8000) { // Roughly 1 second at 8kHz
                  const transcript = await processAudioChunk(audioBuffer);
                  audioBuffer = ''; // Reset buffer
                  
                  if (transcript) {
                    fastify.log.debug('Audio transcribed', { callSid, transcript });
                    const response = await orchestrator.processSpeech(callSid, transcript, 0.9);
                    await sendTTSToCall(fastify, socket, response);
                  }
                }
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

      socket.on('close', (code: number, reason: Buffer) => {
        clearInterval(timeoutHandler);
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

// Process audio using OpenAI Whisper
async function processAudioChunk(audioBase64: string): Promise<string | null> {
  try {
    if (!audioBase64 || audioBase64.length < 1000) {
      return null; // Too short to process
    }

    // Convert base64 to buffer and create form data for Whisper
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    
    // For now, return mock transcripts but structure for real Whisper integration
    // In production, you would send audioBuffer to OpenAI Whisper API
    const audioLength = audioBase64.length;
    
    if (audioLength > 15000) {
      return "I'd like to book an appointment for next week please";
    } else if (audioLength > 10000) {
      return "What are your opening hours?";
    } else if (audioLength > 5000) {
      return "Hello, I need some help";
    } else {
      return "Hi";
    }
  } catch (error) {
    console.error('Audio processing error:', error);
    return null;
  }
}

// Enhanced TTS function with real TTS integration
async function sendTTSToCall(fastifyInstance: any, socket: any, text: string): Promise<void> {
  try {
    fastifyInstance.log.info('Sending TTS response:', { text });
    
    try {
      // Method 1: Use real TTS service for better quality
      const audioBuffer = await ttsService.synthesize(text);
      
      if (audioBuffer.length > 0) {
        // Convert audio to base64 and send as media
        const audioBase64 = audioBuffer.toString('base64');
        const chunkSize = 8000; // Appropriate for Twilio's format
        
        // Send audio in chunks
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
          
          // Small delay between chunks to avoid overwhelming
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        return;
      }
    } catch (ttsError) {
      fastifyInstance.log.warn('TTS service failed, falling back to Twilio Say:', ttsError);
    }
    
    // Method 2: Fallback to Twilio's built-in TTS
    const sayMessage = {
      event: 'say',
      text: text,
      voice: 'alice',
      language: 'en-AU'
    };
    
    socket.send(JSON.stringify(sayMessage));
    
  } catch (error) {
    fastifyInstance.log.error('TTS error:', error);
    
    // Final fallback: Send a simple error message
    const fallbackMessage = {
      event: 'say',
      text: 'Sorry, I had trouble with that response. Can you repeat?',
      voice: 'alice',
      language: 'en-AU'
    };
    socket.send(JSON.stringify(fallbackMessage));
  }
}

/*
// Future TTS integration function (placeholder)
async function convertTextToSpeech(text: string): Promise<Buffer> {
  // This would integrate with Azure Speech Services, ElevenLabs, or similar
  // For now, return empty buffer as placeholder
  return Buffer.alloc(0);
}
*/

export default twilioRoutes; 