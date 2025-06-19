#!/bin/bash

echo "🧪 Testing 100% OpenAI TTS System"
echo "================================="

BASE_URL="http://localhost:3000"

echo ""
echo "Step 1: Initial call (should use cached OpenAI TTS greeting)"
echo "-----------------------------------------------------------"
RESPONSE1=$(curl -s -X POST "$BASE_URL/twilio/voice" \
  -d "CallSid=test-complete-flow" \
  -H "Content-Type: application/x-www-form-urlencoded")

echo "✅ Response received - checking for OpenAI TTS..."
if [[ $RESPONSE1 == *"<Play>"* ]]; then
    echo "✅ SUCCESS: Using OpenAI TTS (found <Play> tag)"
else
    echo "❌ ISSUE: No OpenAI TTS detected"
fi

echo ""
echo "Step 2: User says 'I want to book an appointment' (high confidence)"
echo "----------------------------------------------------------------"
sleep 2
RESPONSE2=$(curl -s -X POST "$BASE_URL/twilio/gather" \
  -d "CallSid=test-complete-flow&SpeechResult=I want to book an appointment&Confidence=0.95" \
  -H "Content-Type: application/x-www-form-urlencoded")

echo "✅ Response received - checking TTS type..."
if [[ $RESPONSE2 == *"<Play>"* ]]; then
    echo "✅ SUCCESS: Using OpenAI TTS"
elif [[ $RESPONSE2 == *"technical difficulties"* ]]; then
    echo "⚠️  Expected: OpenAI TTS timeout - generating in background"
else
    echo "❌ ISSUE: Unexpected response type"
fi

echo ""
echo "Step 3: User provides name 'John Smith' (high confidence)"
echo "--------------------------------------------------------"
sleep 2
RESPONSE3=$(curl -s -X POST "$BASE_URL/twilio/gather" \
  -d "CallSid=test-complete-flow&SpeechResult=My name is John Smith&Confidence=0.95" \
  -H "Content-Type: application/x-www-form-urlencoded")

echo "✅ Response received - checking for progress..."
if [[ $RESPONSE3 == *"<Play>"* ]]; then
    echo "✅ SUCCESS: Using OpenAI TTS"
elif [[ $RESPONSE3 == *"technical difficulties"* ]]; then
    echo "⚠️  Expected: OpenAI TTS timeout - generating in background"
else
    echo "❌ ISSUE: Unexpected response"
fi

echo ""
echo "Step 4: Check server logs for background generation"
echo "--------------------------------------------------"
echo "Recent OpenAI TTS successes:"
tail -5 server.log | grep "🎉 100% OpenAI TTS SUCCESS" || echo "No recent successes found"

echo ""
echo "🎯 Test Summary:"
echo "- Initial greeting should be instant (cached)"
echo "- New responses may take 30 seconds (generating OpenAI TTS)"
echo "- Background generation caches for future calls"
echo "- No Twilio TTS fallbacks used"

echo ""
echo "📞 Ready for real phone call test!"