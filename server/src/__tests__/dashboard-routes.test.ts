import { FastifyInstance } from 'fastify';
import { build } from '../app'; // Assuming you have an app builder
import { db } from '../services/database';
import { bookingService } from '../services/booking';

// Mock dependencies
jest.mock('../services/database');
jest.mock('../services/booking');

const mockDb = db as jest.Mocked<typeof db>;
const mockBookingService = bookingService as jest.Mocked<typeof bookingService>;

describe('Dashboard Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Build app without starting the server
    app = build({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/bookings', () => {
    it('should return bookings for default tenant', async () => {
      const mockBookings = [
        {
          id: 'booking-1',
          customer_name: 'John Doe',
          service_type: 'pest control',
          status: 'pending'
        }
      ];

      mockBookingService.getBookings.mockResolvedValue(mockBookings as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/bookings'
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockBookings);
      expect(mockBookingService.getBookings).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000' // Default tenant
      );
    });

    it('should use tenant ID from header when provided', async () => {
      const customTenantId = 'custom-tenant-id';
      const mockBookings = [];

      mockBookingService.getBookings.mockResolvedValue(mockBookings);

      const response = await app.inject({
        method: 'GET',
        url: '/api/bookings',
        headers: {
          'x-tenant-id': customTenantId
        }
      });

      expect(response.statusCode).toBe(200);
      expect(mockBookingService.getBookings).toHaveBeenCalledWith(customTenantId);
    });

    it('should handle errors gracefully', async () => {
      mockBookingService.getBookings.mockRejectedValue(new Error('Database error'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/bookings'
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Failed to get bookings'
      });
    });
  });

  describe('GET /api/technicians', () => {
    it('should return technicians for tenant', async () => {
      const mockTechnicians = [
        {
          id: 'tech-1',
          name: 'Mike Johnson',
          specialties: ['termite inspection'],
          emergencyContact: true
        }
      ];

      mockDb.getTechnicians.mockResolvedValue(mockTechnicians as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/technicians'
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockTechnicians);
    });
  });

  describe('PATCH /api/bookings/:id', () => {
    it('should update booking status', async () => {
      const bookingId = 'booking-123';
      const updatedBooking = {
        id: bookingId,
        status: 'confirmed'
      };

      mockBookingService.updateBookingStatus.mockResolvedValue(updatedBooking as any);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/bookings/${bookingId}`,
        payload: {
          status: 'confirmed'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(updatedBooking);
      expect(mockBookingService.updateBookingStatus).toHaveBeenCalledWith(
        bookingId,
        'confirmed',
        undefined
      );
    });

    it('should assign technician to booking', async () => {
      const bookingId = 'booking-123';
      const technicianId = 'tech-456';
      const updatedBooking = {
        id: bookingId,
        technicianId: technicianId
      };

      mockDb.assignTechnician.mockResolvedValue(updatedBooking as any);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/bookings/${bookingId}`,
        payload: {
          technicianId: technicianId
        }
      });

      expect(response.statusCode).toBe(200);
      expect(mockDb.assignTechnician).toHaveBeenCalledWith(bookingId, technicianId);
    });

    it('should return 404 when booking not found', async () => {
      const bookingId = 'nonexistent-booking';

      mockBookingService.updateBookingStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/bookings/${bookingId}`,
        payload: {
          status: 'confirmed'
        }
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Booking not found'
      });
    });

    it('should return 400 when no update parameters provided', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/bookings/booking-123',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'No update parameters provided'
      });
    });
  });

  describe('POST /api/technicians/recommend', () => {
    it('should return recommended technicians', async () => {
      const mockRecommendations = [
        {
          id: 'tech-1',
          name: 'Emergency Tech',
          emergencyContact: true,
          current_bookings: 2
        }
      ];

      mockDb.findBestTechnicianForService.mockResolvedValue(mockRecommendations as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/technicians/recommend',
        payload: {
          serviceType: 'termite emergency',
          isEmergency: true
        }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockRecommendations);
      expect(mockDb.findBestTechnicianForService).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'termite emergency',
        true
      );
    });
  });
});