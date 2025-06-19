import { FastifyInstance } from 'fastify';
import { db } from '@/services/database';
import { bookingService } from '@/services/booking';

export async function dashboardRoutes(fastify: FastifyInstance) {
  // Dashboard stats endpoint
  fastify.get('/api/dashboard/stats', async (request, reply) => {
    try {
      const stats = await db.getDashboardStats();
      return stats;
    } catch (error) {
      console.error('Failed to get dashboard stats:', error);
      return reply.status(500).send({ error: 'Failed to get dashboard stats' });
    }
  });

  // Get all bookings
  fastify.get('/api/bookings', async (request, reply) => {
    try {
      // For demo, use the default tenant ID
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const bookings = await bookingService.getBookings(tenantId);
      return bookings;
    } catch (error) {
      console.error('Failed to get bookings:', error);
      return reply.status(500).send({ error: 'Failed to get bookings' });
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
      
      return updatedBooking;
    } catch (error) {
      console.error('Failed to update booking:', error);
      return reply.status(500).send({ error: 'Failed to update booking' });
    }
  });

  // Health check for the dashboard API
  fastify.get('/api/health', async (request, reply) => {
    try {
      const dbHealthy = await db.healthCheck();
      return {
        status: 'ok',
        database: dbHealthy ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return reply.status(500).send({
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString()
      });
    }
  });
}