
import 'module-alias/register';
import Fastify from 'fastify';
import { config } from 'dotenv';
import path from 'path';
import { AzureTTSService } from './src/services/tts';

// Explicitly load .env from the root directory
config({ path: path.resolve(__dirname, '../.env'), override: true });

const fastify = Fastify({
  logger: true
});

// Endpoint to check the loaded environment variables
fastify.get('/env', async (request, reply) => {
  const azureKey = process.env.AZURE_SPEECH_KEY;
  const azureRegion = process.env.AZURE_SPEECH_REGION;

  reply.send({
    AZURE_SPEECH_KEY: azureKey ? `Loaded (${azureKey.length} chars, ends with '${azureKey.slice(-4)}')` : 'NOT LOADED',
    AZURE_SPEECH_REGION: azureRegion || 'NOT LOADED'
  });
});

// Endpoint to test the Azure TTS connection
fastify.get('/test-azure', async (request, reply) => {
  try {
    const tts = new AzureTTSService();
    const audioBuffer = await tts.synthesize('This is a test.');
    if (audioBuffer.length > 0) {
      reply.send({ status: 'Success', message: `Azure TTS connection successful! Audio buffer received (${audioBuffer.length} bytes).` });
    } else {
      reply.status(500).send({ status: 'Failure', message: 'Empty audio buffer received.' });
    }
  } catch (error: any) {
    reply.status(500).send({ status: 'Failure', message: error.message, error: error });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log('Debug server listening on http://localhost:3001');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
