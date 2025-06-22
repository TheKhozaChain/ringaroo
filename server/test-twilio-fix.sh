#!/bin/bash

echo "Testing Twilio webhook endpoints..."

# Test the voice webhook
echo -e "\n1. Testing /twilio/voice endpoint:"
curl -X POST http://localhost:3000/twilio/voice \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123456789&From=+1234567890&To=+0987654321" \
  -s | xmllint --format - 2>/dev/null || echo "XML parsing failed"

# Test the gather webhook
echo -e "\n2. Testing /twilio/gather endpoint:"
curl -X POST http://localhost:3000/twilio/gather \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123456789&SpeechResult=I need help with pest control&Confidence=0.95" \
  -s | xmllint --format - 2>/dev/null || echo "XML parsing failed"

echo -e "\nTest completed. Check server logs for detailed information."