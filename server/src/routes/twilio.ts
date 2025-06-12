import { FastifyPluginAsync } from 'fastify';
import { orchestrator } from '@/services/orchestrator';
import { ttsService } from '@/services/tts';
import { speechService, AudioFormat } from '@/services/speech';
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
      const webhookUrl = process.env.WEBHOOK_BASE_URL || `https://${request.headers.host}`;
      const streamUrl = webhookUrl.replace('https://', 'wss://') + '/twilio/stream';
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
      let silenceTimer: NodeJS.Timeout | null = null;
      let isProcessingAudio = false;
      
      // Audio processing configuration
      const AUDIO_CHUNK_SIZE = 8000; // ~1 second at 8kHz
      const SILENCE_TIMEOUT = 1500; // 1.5 seconds of silence before processing
      const MIN_AUDIO_LENGTH = 1600; // Minimum audio length to process (~200ms)

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


export default twilioRoutes; 