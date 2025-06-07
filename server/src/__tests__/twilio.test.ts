import { buildApp } from '../index';
import { FastifyInstance } from 'fastify';

describe('Twilio Webhook Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /twilio/voice', () => {
    it('should return TwiML with streaming instructions', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/twilio/voice',
        payload: {
          CallSid: 'test-call-sid-123',
          From: '+61412345678',
          To: '+61491570006',
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/xml');
      
      const twiml = response.body;
      expect(twiml).toContain('<Response>');
      expect(twiml).toContain('<Connect>');
      expect(twiml).toContain('<Stream url=');
      expect(twiml).toContain('/twilio/stream');
      expect(twiml).toContain('<Say voice="alice" language="en-AU">');
      expect(twiml).toContain('</Response>');
    });

    it('should handle missing call parameters gracefully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/twilio/voice',
        payload: {},
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/xml');
    });
  });

  describe('POST /twilio/status', () => {
    it('should handle call status updates', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/twilio/status',
        payload: {
          CallSid: 'test-call-sid-123',
          CallStatus: 'completed',
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
    });

    it('should handle in-progress call status', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/twilio/status',
        payload: {
          CallSid: 'test-call-sid-456',
          CallStatus: 'in-progress',
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
    });
  });

  describe('WebSocket /twilio/stream', () => {
    it('should handle websocket upgrade', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/twilio/stream',
        headers: {
          'Connection': 'Upgrade',
          'Upgrade': 'websocket',
          'Sec-WebSocket-Key': 'test-key',
          'Sec-WebSocket-Version': '13',
        },
      });

      // WebSocket upgrade should return 101 or fail gracefully in test
      expect([101, 400, 426]).toContain(response.statusCode);
    });
  });
}); 