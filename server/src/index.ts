import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
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
      },
    });
  });

  // Register route plugins
  await fastify.register(twilioRoutes);
  await fastify.register(actionsRoutes);

  return fastify;
}

async function start() {
  try {
    // Connect to services
    await redis.connect();
    fastify.log.info('✅ Connected to Redis');

    // Test database connection
    fastify.log.info('Testing database connection...');
    const dbHealthy = await db.healthCheck();
    if (!dbHealthy) {
      throw new Error(`Database connection failed. Check that PostgreSQL is running and accessible at: ${appConfig.databaseUrl}`);
    }
    fastify.log.info('✅ Connected to PostgreSQL database');

    // Build and start server
    const app = await buildApp();
    
    const address = await app.listen({
      port: appConfig.port,
      host: '0.0.0.0',
    });

    fastify.log.info(`🚀 Ringaroo server listening at ${address}`);
    fastify.log.info(`📞 Webhook URL: ${appConfig.webhookBaseUrl}/twilio/voice`);
    fastify.log.info(`🎤 Stream URL: ${appConfig.webhookBaseUrl.replace('http', 'ws')}/twilio/stream`);

    // Graceful shutdown
    const shutdown = async () => {
      fastify.log.info('Shutting down server...');
      
      try {
        await redis.disconnect();
        await db.close();
        await app.close();
        process.exit(0);
      } catch (error) {
        fastify.log.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    fastify.log.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  start();
}

export { buildApp, start };
export default fastify; 