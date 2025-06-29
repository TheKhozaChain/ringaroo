import 'module-alias/register';
import { AzureTTSService } from './src/services/tts';

async function testAzure() {
  try {
    console.log('Attempting to connect to Azure TTS...');
    const tts = new AzureTTSService();
    const audioBuffer = await tts.synthesize('This is a test.');
    if (audioBuffer.length > 0) {
      console.log('✅ Azure TTS connection successful! Audio buffer received.');
    } else {
      console.error('❌ Azure TTS connection failed: Empty audio buffer received.');
    }
  } catch (error) {
    console.error('❌ Azure TTS connection failed:', error);
  }
}

testAzure();