import { FastifyPluginAsync } from 'fastify';
import { orchestrator } from '@/services/orchestrator';
import type { TwilioStreamMessage } from '@/types';

const twilioRoutes: FastifyPluginAsync = async function (fastify) {
  // Incoming call webhook - returns TwiML to start media stream
  fastify.post('/twilio/voice', async (request, reply) => {
    const { CallSid, From, To } = request.body as any;

    fastify.log.info('Incoming call', { CallSid, From, To });

    // Initialize dialogue state
    await orchestrator.initializeCall(CallSid, From);

    // Return TwiML to start media stream
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="wss://${request.headers.host}/twilio/stream" />
    </Connect>
    <Say voice="alice" language="en-AU">
        G'day! You've reached our AI assistant. Please hold on while I connect you.
    </Say>
</Response>`;

    reply.type('text/xml').send(twiml);
  });

  // Call status webhook
  fastify.post('/twilio/status', async (request, reply) => {
    const { CallSid, CallStatus } = request.body as any;
    
    fastify.log.info('Call status update', { CallSid, CallStatus });

    if (CallStatus === 'completed' || CallStatus === 'failed') {
      await orchestrator.endCall(CallSid);
    }

    reply.send({ status: 'ok' });
  });

  // WebSocket handler for media streams
  fastify.register(async function (fastify) {
    fastify.get('/twilio/stream', { websocket: true }, (connection, request) => {
      const { socket } = connection;
      let callSid: string | null = null;
      let audioBuffer = '';

      socket.on('message', async (message: Buffer) => {
        try {
          const data: TwilioStreamMessage = JSON.parse(message.toString());

          switch (data.event) {
            case 'connected':
              fastify.log.info('WebSocket connected');
              break;

            case 'start':
              callSid = data.start?.callSid || null;
              fastify.log.info('Media stream started', { callSid });
              
              // Send initial greeting
              if (callSid) {
                const greeting = "G'day! Thanks for calling. I'm Johnno, your AI assistant. How can I help you today?";
                await sendTTSToCall(socket, greeting);
              }
              break;

            case 'media':
              if (data.media && callSid) {
                // Accumulate audio data
                audioBuffer += data.media.payload;
                
                // Process when we have enough audio (simple approach for demo)
                if (audioBuffer.length > 8000) { // Roughly 1 second at 8kHz
                  const transcript = await processAudioChunk(audioBuffer);
                  audioBuffer = ''; // Reset buffer
                  
                  if (transcript) {
                    const response = await orchestrator.processSpeech(callSid, transcript, 0.9);
                    await sendTTSToCall(socket, response);
                  }
                }
              }
              break;

            case 'stop':
              fastify.log.info('Media stream stopped', { callSid });
              if (callSid) {
                await orchestrator.endCall(callSid);
              }
              break;
          }
        } catch (error) {
          fastify.log.error('WebSocket message error:', error);
        }
      });

      socket.on('close', () => {
        fastify.log.info('WebSocket connection closed', { callSid });
        if (callSid) {
          orchestrator.endCall(callSid).catch(console.error);
        }
      });

      socket.on('error', (error) => {
        fastify.log.error('WebSocket error:', error);
      });
    });
  });
};

// Mock function for audio processing (would integrate with OpenAI Whisper)
async function processAudioChunk(audioBase64: string): Promise<string | null> {
  try {
    // For demo purposes, return mock transcripts based on audio length
    const audioLength = audioBase64.length;
    
    if (audioLength > 10000) {
      return "I'd like to book an appointment please";
    } else if (audioLength > 5000) {
      return "What are your opening hours?";
    } else {
      return "Hello";
    }
  } catch (error) {
    console.error('Audio processing error:', error);
    return null;
  }
}

// Mock function for TTS (would integrate with Azure Speech or ElevenLabs)
async function sendTTSToCall(socket: any, text: string): Promise<void> {
  try {
    // For demo, we'll send a simple audio packet
    // In production, this would convert text to speech and stream audio
    const audioData = Buffer.from('mock-audio-data').toString('base64');
    
    const mediaMessage = {
      event: 'media',
      media: {
        payload: audioData,
      },
    };

    socket.send(JSON.stringify(mediaMessage));
  } catch (error) {
    console.error('TTS error:', error);
  }
}

export default twilioRoutes; 