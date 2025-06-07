#!/usr/bin/env tsx

import twilio from 'twilio';
import { appConfig } from '@/config';

const client = twilio(appConfig.twilioAccountSid, appConfig.twilioAuthToken);

async function runCallDemo() {
  console.log('🚀 Starting Ringaroo Call Demo...');
  console.log('📞 This will place a test call to demonstrate the booking functionality');
  
  try {
    // Create a test call
    const call = await client.calls.create({
      url: `${appConfig.webhookBaseUrl}/twilio/voice`,
      to: appConfig.twilioPhoneNumber, // Call our own number for demo
      from: appConfig.twilioPhoneNumber,
      method: 'POST',
      statusCallback: `${appConfig.webhookBaseUrl}/twilio/status`,
      statusCallbackMethod: 'POST',
      record: false, // Don't record demo calls
    });

    console.log(`✅ Demo call initiated!`);
    console.log(`📞 Call SID: ${call.sid}`);
    console.log(`🔗 Call Status: ${call.status}`);
    console.log(`📱 From: ${call.from}`);
    console.log(`📱 To: ${call.to}`);
    
    console.log('\n📋 Demo Scenario:');
    console.log('The call will simulate a customer booking an appointment:');
    console.log('1. Johnno (AI) will greet the caller');
    console.log('2. Mock audio will simulate: "I\'d like to book an appointment please"');
    console.log('3. Johnno will ask for details');
    console.log('4. System will process the booking request');
    
    // Wait a bit and then show call details
    console.log('\n⏳ Waiting for call to process...');
    
    setTimeout(async () => {
      try {
        const updatedCall = await client.calls(call.sid).fetch();
        console.log(`\n📊 Final Call Status: ${updatedCall.status}`);
        console.log(`⏱️  Duration: ${updatedCall.duration || 'N/A'} seconds`);
        
        if (updatedCall.status === 'completed') {
          console.log('✅ Demo call completed successfully!');
        } else {
          console.log('⚠️  Call may still be in progress...');
        }
        
        console.log('\n🎯 Next Steps:');
        console.log('1. Check the server logs for dialogue transcripts');
        console.log('2. Verify booking was created in the database');
        console.log('3. Test with a real phone number for end-to-end validation');
        
      } catch (error) {
        console.error('Error fetching call details:', error);
      }
    }, 10000); // Wait 10 seconds
    
  } catch (error) {
    console.error('❌ Demo call failed:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('authentication')) {
        console.log('\n🔑 Authentication Error:');
        console.log('- Check your TWILIO_ACCOUNT_SID in .env');
        console.log('- Check your TWILIO_AUTH_TOKEN in .env');
        console.log('- Ensure your Twilio account is active');
      } else if (error.message.includes('webhook')) {
        console.log('\n🌐 Webhook Error:');
        console.log('- Ensure your server is running on the correct port');
        console.log('- Check WEBHOOK_BASE_URL in .env');
        console.log('- For local development, use ngrok to expose your server');
        console.log('  Example: ngrok http 3000');
      } else if (error.message.includes('phone number')) {
        console.log('\n📱 Phone Number Error:');
        console.log('- Check your TWILIO_PHONE_NUMBER in .env');
        console.log('- Ensure the number is verified in your Twilio account');
      }
    }
    
    process.exit(1);
  }
}

async function setupDemo() {
  console.log('🔧 Demo Prerequisites Check:');
  
  // Check environment variables
  const requiredVars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN', 
    'TWILIO_PHONE_NUMBER',
    'WEBHOOK_BASE_URL'
  ];
  
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value) {
      console.error(`❌ Missing required environment variable: ${varName}`);
      console.log('📝 Please check your .env file and ensure all Twilio credentials are set');
      process.exit(1);
    }
    console.log(`✅ ${varName}: ${value.substring(0, 8)}...`);
  }
  
  // Check if webhook URL is accessible
  console.log(`\n🌐 Webhook URL: ${appConfig.webhookBaseUrl}`);
  
  if (appConfig.webhookBaseUrl.includes('localhost') || appConfig.webhookBaseUrl.includes('127.0.0.1')) {
    console.log('⚠️  Warning: Using localhost webhook URL');
    console.log('   For Twilio to reach your webhook, you need to expose it publicly');
    console.log('   Consider using ngrok: npx ngrok http 3000');
  }
  
  console.log('\n📋 Demo will test the following flow:');
  console.log('1. Place outbound call via Twilio API');
  console.log('2. Webhook receives call and returns TwiML');
  console.log('3. WebSocket stream processes mock audio');
  console.log('4. GPT-4o generates responses');
  console.log('5. Booking action gets triggered');
  console.log('6. Call completion is logged');
  
  return true;
}

// Main execution
if (require.main === module) {
  setupDemo()
    .then(() => runCallDemo())
    .catch((error) => {
      console.error('Demo setup failed:', error);
      process.exit(1);
    });
}

export { runCallDemo, setupDemo }; 