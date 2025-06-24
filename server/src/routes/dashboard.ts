import { FastifyInstance } from 'fastify';
import { db } from '@/services/database';
import { bookingService } from '@/services/booking';
import { availabilityService } from '@/services/availability';

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
      const { status, notes, technicianId } = request.body as { 
        status?: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
        notes?: string;
        technicianId?: string;
      };
      
      let updatedBooking;
      
      if (technicianId !== undefined) {
        // Assign or unassign technician
        updatedBooking = technicianId 
          ? await db.assignTechnician(id, technicianId)
          : await db.updateBooking(id, { technicianId: null });
      } else if (status) {
        // Update booking status
        updatedBooking = await bookingService.updateBookingStatus(id, status, notes);
      } else {
        return reply.status(400).send({ error: 'No update parameters provided' });
      }
      
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

  // Get all technicians
  fastify.get('/api/technicians', async (request, reply) => {
    try {
      // For demo, use the default tenant ID
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const technicians = await db.getTechnicians(tenantId);
      return technicians;
    } catch (error) {
      console.error('Failed to get technicians:', error);
      return reply.status(500).send({ error: 'Failed to get technicians' });
    }
  });

  // Get technician availability for a specific date
  fastify.get('/api/technicians/availability/:date', async (request, reply) => {
    try {
      const { date } = request.params as { date: string };
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        return reply.status(400).send({ error: 'Invalid date format' });
      }
      
      const technicians = await db.getTechniciansAvailableForDate(tenantId, targetDate);
      
      // Get bookings for each technician on that date
      const techniciansWithBookings = await Promise.all(
        technicians.map(async (tech) => {
          const bookings = await db.getTechnicianBookingsForDate(tech.id, targetDate);
          return {
            ...tech,
            bookingsCount: bookings.length,
            bookings: bookings
          };
        })
      );
      
      return techniciansWithBookings;
    } catch (error) {
      console.error('Failed to get technician availability:', error);
      return reply.status(500).send({ error: 'Failed to get technician availability' });
    }
  });

  // Get recommended technician for a service
  fastify.post('/api/technicians/recommend', async (request, reply) => {
    try {
      const { serviceType, isEmergency } = request.body as { 
        serviceType?: string; 
        isEmergency?: boolean; 
      };
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      
      const recommendedTechnicians = await db.findBestTechnicianForService(
        tenantId, 
        serviceType || '', 
        isEmergency || false
      );
      
      return recommendedTechnicians;
    } catch (error) {
      console.error('Failed to get technician recommendations:', error);
      return reply.status(500).send({ error: 'Failed to get technician recommendations' });
    }
  });

  // Check availability for a specific date
  fastify.get('/api/availability/:date', async (request, reply) => {
    try {
      const { date } = request.params as { date: string };
      const { technicianId, duration } = request.query as { 
        technicianId?: string; 
        duration?: string; 
      };
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        return reply.status(400).send({ error: 'Invalid date format' });
      }
      
      const serviceDuration = duration ? parseInt(duration) : 120;
      
      const availability = await availabilityService.checkAvailability(
        tenantId,
        targetDate,
        technicianId,
        serviceDuration
      );
      
      return availability;
    } catch (error) {
      console.error('Failed to check availability:', error);
      return reply.status(500).send({ error: 'Failed to check availability' });
    }
  });

  // Find next available slot
  fastify.post('/api/availability/next-slot', async (request, reply) => {
    try {
      const { serviceType, duration, isEmergency, preferredDate } = request.body as {
        serviceType: string;
        duration?: number;
        isEmergency?: boolean;
        preferredDate?: string;
      };
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      
      const preferred = preferredDate ? new Date(preferredDate) : undefined;
      
      const nextSlot = await availabilityService.findNextAvailableSlot(
        tenantId,
        serviceType,
        duration || 120,
        isEmergency || false,
        preferred
      );
      
      return nextSlot;
    } catch (error) {
      console.error('Failed to find next available slot:', error);
      return reply.status(500).send({ error: 'Failed to find next available slot' });
    }
  });

  // Check booking conflicts
  fastify.post('/api/availability/check-conflicts', async (request, reply) => {
    try {
      const { date, startTime, duration, technicianId, excludeBookingId } = request.body as {
        date: string;
        startTime: string;
        duration: number;
        technicianId?: string;
        excludeBookingId?: string;
      };
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        return reply.status(400).send({ error: 'Invalid date format' });
      }
      
      const conflicts = await availabilityService.checkBookingConflicts(
        tenantId,
        targetDate,
        startTime,
        duration,
        technicianId,
        excludeBookingId
      );
      
      return conflicts;
    } catch (error) {
      console.error('Failed to check booking conflicts:', error);
      return reply.status(500).send({ error: 'Failed to check booking conflicts' });
    }
  });

  // Get technician workload
  fastify.get('/api/technicians/:id/workload/:date', async (request, reply) => {
    try {
      const { id, date } = request.params as { id: string; date: string };
      
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        return reply.status(400).send({ error: 'Invalid date format' });
      }
      
      const workload = await availabilityService.getTechnicianWorkload(id, targetDate);
      
      return workload;
    } catch (error) {
      console.error('Failed to get technician workload:', error);
      return reply.status(500).send({ error: 'Failed to get technician workload' });
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