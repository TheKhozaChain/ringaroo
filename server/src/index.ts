import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import formbody from '@fastify/formbody';
import { appConfig } from '@/config';
import { db } from '@/services/database';
import { redis } from '@/services/redis';
import twilioRoutes from '@/routes/twilio';
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
      },
    } : undefined,
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

  // Register route plugins
  await fastify.register(twilioRoutes);
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