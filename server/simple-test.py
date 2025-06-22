#!/usr/bin/env python3

import subprocess
import time
import json
import re

def test_scenario(scenario_name, speech_text, call_id):
    print(f"\n🧪 Testing: {scenario_name}")
    print("-" * 40)
    
    start_time = time.time()
    
    try:
        cmd = [
            'curl', '-s', '-X', 'POST', 
            'http://localhost:3000/twilio/gather',
            '-d', f'CallSid={call_id}&SpeechResult={speech_text}&Confidence=0.9',
            '-H', 'Content-Type: application/x-www-form-urlencoded'
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        end_time = time.time()
        response_time = (end_time - start_time) * 1000
        
        print(f"✅ Response time: {response_time:.2f}ms")
        print(f"✅ Status: {'Success' if result.returncode == 0 else 'Failed'}")
        
        if result.stdout:
            tts_count = result.stdout.count('<Play>')
            fallback_count = result.stdout.count('<Say>')
            
            print(f"✅ OpenAI TTS detected: {tts_count} instances")
            print(f"✅ Fallback TTS: {fallback_count} instances")
            
            # Extract timeout values
            gather_timeout = re.search(r'timeout="([^"]*)"', result.stdout)
            speech_timeout = re.search(r'speechTimeout="([^"]*)"', result.stdout)
            
            if gather_timeout:
                print(f"✅ Gather timeout: {gather_timeout.group(1)}s")
            if speech_timeout:
                print(f"✅ Speech timeout: {speech_timeout.group(1)}s")
                
            # Check for errors in response
            if 'error' in result.stdout.lower():
                print(f"⚠️  Response contains error indicators")
        
        return {
            'scenario': scenario_name,
            'response_time_ms': response_time,
            'success': result.returncode == 0,
            'tts_instances': tts_count if result.stdout else 0,
            'fallback_instances': fallback_count if result.stdout else 0,
            'gather_timeout': gather_timeout.group(1) if gather_timeout else None,
            'speech_timeout': speech_timeout.group(1) if speech_timeout else None
        }
        
    except subprocess.TimeoutExpired:
        print("❌ Request timed out after 30 seconds")
        return {'scenario': scenario_name, 'response_time_ms': 30000, 'success': False, 'timeout': True}
    except Exception as e:
        print(f"❌ Error: {e}")
        return {'scenario': scenario_name, 'success': False, 'error': str(e)}

def main():
    print("🎯 BASELINE PERFORMANCE TEST - CURRENT SYSTEM")
    print("=" * 50)

    # Test server health first
    try:
        health_result = subprocess.run(['curl', '-s', 'http://localhost:3000/health'], 
                                     capture_output=True, text=True, timeout=10)
        if health_result.returncode == 0:
            health_data = json.loads(health_result.stdout)
            print(f"✅ Server Status: {health_data.get('status', 'unknown')}")
            print(f"✅ Database: {health_data.get('services', {}).get('database', 'unknown')}")
            print(f"✅ Redis: {health_data.get('services', {}).get('redis', 'unknown')}")
        else:
            print("❌ Server health check failed")
            return
    except Exception as e:
        print(f"❌ Cannot connect to server: {e}")
        return

    # Test demo scenarios
    scenarios = [
        ("Termite Emergency", "Hi I have a termite emergency in Mosman", "baseline-test-1"),
        ("Service Inquiry", "Do you service Cremorne what services do you offer", "baseline-test-2"),
        ("Booking Request", "My name is John and I need to book a pest control treatment for Friday", "baseline-test-3"),
        ("Business Hours", "What are your business hours", "baseline-test-4")
    ]

    baseline_results = []
    for scenario_name, speech_text, call_id in scenarios:
        result = test_scenario(scenario_name, speech_text, call_id)
        baseline_results.append(result)
        time.sleep(1)

    # Calculate summary statistics
    successful_tests = [r for r in baseline_results if r.get('success', False)]
    if successful_tests:
        avg_response_time = sum(r['response_time_ms'] for r in successful_tests) / len(successful_tests)
        min_response_time = min(r['response_time_ms'] for r in successful_tests)
        max_response_time = max(r['response_time_ms'] for r in successful_tests)
        
        print(f"\n📊 BASELINE SUMMARY:")
        print("=" * 30)
        print(f"Total scenarios tested: {len(baseline_results)}")
        print(f"Successful tests: {len(successful_tests)}")
        print(f"Average response time: {avg_response_time:.2f}ms")
        print(f"Min response time: {min_response_time:.2f}ms")
        print(f"Max response time: {max_response_time:.2f}ms")
        
        # Save results to file
        with open('baseline-results.json', 'w') as f:
            json.dump({
                'timestamp': time.time(),
                'summary': {
                    'total_tests': len(baseline_results),
                    'successful_tests': len(successful_tests),
                    'avg_response_time_ms': avg_response_time,
                    'min_response_time_ms': min_response_time,
                    'max_response_time_ms': max_response_time
                },
                'detailed_results': baseline_results
            }, f, indent=2)
        print(f"\n💾 Results saved to baseline-results.json")
    else:
        print("❌ No successful tests to analyze")

    return baseline_results

if __name__ == "__main__":
    main()