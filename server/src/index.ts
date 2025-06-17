import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import formbody from '@fastify/formbody';
import { appConfig } from '@/config';
import { db } from '@/services/database';
import { redis } from '@/services/redis';
import { bookingService } from '@/services/booking';
import twilioRobustRoutes from '@/routes/twilio-robust';
import actionsRoutes from '@/routes/actions';

const fastify = Fastify({
  logger: {
    level: appConfig.logLevel,
    transport: appConfig.nodeEnv === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        levelFirst: true,
        messageFormat: '[CONVERSATION] {msg}',
        timestampKey: 'time',
      },
    } : undefined,
    serializers: {
      req: (req: any) => ({
        method: req.method,
        url: req.url,
        headers: {
          host: req.headers.host,
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type']
        },
        remoteAddress: req.socket?.remoteAddress,
        remotePort: req.socket?.remotePort
      }),
      res: (res: any) => ({
        statusCode: res.statusCode,
        headers: res.headers
      }),
      err: (err: any) => ({
        type: err.constructor.name,
        message: err.message,
        stack: err.stack
      })
    }
  },
});

async function buildApp() {
  // Register CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Register form body parser for Twilio webhooks
  await fastify.register(formbody);

  // Register WebSocket support
  await fastify.register(websocket);

  // Health check endpoint
  fastify.get('/health', async (request, reply) => {
    let dbHealth = false;
    let redisHealth = false;
    
    try {
      dbHealth = await db.healthCheck();
    } catch (error) {
      dbHealth = false;
    }
    
    try {
      redisHealth = await redis.healthCheck();
    } catch (error) {
      redisHealth = false;
    }
    
    // Server is healthy if it can respond (databases optional for development)
    const status = 'healthy';
    const statusCode = 200;
    
    reply.status(statusCode).send({
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealth ? 'up' : 'down',
        redis: redisHealth ? 'up' : 'down',
      },
    });
  });

  // API info endpoint
  fastify.get('/', async (request, reply) => {
    reply.send({
      name: 'Ringaroo API',
      version: '0.1.0',
      description: 'AI receptionist for Australian small businesses',
      endpoints: {
        health: '/health',
        webhook: '/twilio/voice',
        stream: '/twilio/stream',
        booking: '/actions/book',
        calls: '/api/calls',
        dashboard: '/api/dashboard',
      },
    });
  });

  // API endpoints for dashboard
  fastify.get('/api/calls', async (request, reply) => {
    try {
      const calls = await db.getCalls();
      reply.send(calls);
    } catch (error) {
      fastify.log.error('Error fetching calls:', error);
      reply.status(500).send({ error: 'Failed to fetch calls' });
    }
  });

  fastify.get('/api/dashboard', async (request, reply) => {
    try {
      const stats = await db.getDashboardStats();
      reply.send(stats);
    } catch (error) {
      fastify.log.error('Error fetching dashboard stats:', error);
      reply.status(500).send({ error: 'Failed to fetch dashboard stats' });
    }
  });

  // Get all bookings
  fastify.get('/api/bookings', async (request, reply) => {
    try {
      // For demo, use the default tenant ID
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const bookings = await bookingService.getBookings(tenantId);
      reply.send(bookings);
    } catch (error) {
      fastify.log.error('Error fetching bookings:', error);
      reply.status(500).send({ error: 'Failed to fetch bookings' });
    }
  });

  // Update booking status
  fastify.patch('/api/bookings/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { status, notes } = request.body as { status: 'pending' | 'confirmed' | 'cancelled', notes?: string };
      
      const updatedBooking = await bookingService.updateBookingStatus(id, status, notes);
      
      if (!updatedBooking) {
        reply.status(404).send({ error: 'Booking not found' });
        return;
      }
      
      reply.send(updatedBooking);
    } catch (error) {
      fastify.log.error('Error updating booking:', error);
      reply.status(500).send({ error: 'Failed to update booking' });
    }
  });

  // Audio file serving endpoint for TTS
  fastify.get('/audio/:filename', async (request, reply) => {
    try {
      const { filename } = request.params as { filename: string };
      
      // Validate filename to prevent directory traversal
      if (!/^[a-zA-Z0-9_\-\.]+\.mp3$/.test(filename)) {
        reply.status(400).send({ error: 'Invalid filename' });
        return;
      }
      
      const audioPath = require('path').join(process.cwd(), 'temp', 'audio', filename);
      
      // Check if file exists and get stats
      let stats;
      try {
        stats = await require('fs/promises').stat(audioPath);
      } catch (error) {
        fastify.log.error(`Audio file not found: ${audioPath}`, error);
        reply.status(404).send({ error: 'Audio file not found' });
        return;
      }
      
      // Set proper headers
      reply.type('audio/mpeg');
      reply.header('Content-Length', stats.size);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Cache-Control', 'public, max-age=3600');
      
      // Read and send file content
      const fileContent = await require('fs/promises').readFile(audioPath);
      reply.send(fileContent);
      
      fastify.log.info(`Served audio file: ${filename} (${stats.size} bytes)`);
      
    } catch (error) {
      fastify.log.error('Error serving audio file:', error);
      reply.status(500).send({ error: 'Failed to serve audio file' });
    }
  });

  // Register route plugins
  await fastify.register(twilioRobustRoutes);
  await fastify.register(actionsRoutes);

  return fastify;
}

async function start() {
  try {
    // Build app first to get the configured logger
    const app = await buildApp();
    
    // Connect to services
    await redis.connect();
    app.log.info('✅ Connected to Redis');

    // Test database connection
    app.log.info('Testing database connection...');
    const dbHealthy = await db.healthCheck();
    if (!dbHealthy) {
      throw new Error(`Database connection failed. Check that PostgreSQL is running and accessible at: ${appConfig.databaseUrl}`);
    }
    app.log.info('✅ Connected to PostgreSQL database');

    // Start server
    const address = await app.listen({
      port: appConfig.port,
      host: '0.0.0.0',
    });

    app.log.info(`🚀 Ringaroo server listening at ${address}`);
    app.log.info(`📞 Webhook URL: ${appConfig.webhookBaseUrl}/twilio/voice`);
    app.log.info(`🎤 Stream URL: ${appConfig.webhookBaseUrl.replace('http', 'ws')}/twilio/stream`);

    // Graceful shutdown
    const shutdown = async () => {
      app.log.info('Shutting down server...');
      
      try {
        await redis.disconnect();
        await db.close();
        await app.close();
        process.exit(0);
      } catch (error) {
        app.log.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  start();
}

export { buildApp, start };
export default fastify; 