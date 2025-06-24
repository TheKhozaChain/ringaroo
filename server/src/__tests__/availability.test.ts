import { availabilityService } from '../services/availability';
import { db } from '../services/database';

// Mock the database service
jest.mock('../services/database');
const mockDb = db as jest.Mocked<typeof db>;

describe('AvailabilityService', () => {
  const mockTenantId = 'test-tenant-id';
  const mockTechnicianId = 'test-technician-id';
  const testDate = new Date('2025-06-25');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAvailability', () => {
    it('should return availability check with no conflicts when no bookings exist', async () => {
      // Mock technician data
      const mockTechnician = {
        id: mockTechnicianId,
        name: 'John Test',
        availability: {
          tue: { start: '09:00', end: '17:00' }
        }
      };

      mockDb.getTechnicianById.mockResolvedValue(mockTechnician as any);
      mockDb.query.mockResolvedValue([]); // No existing bookings

      const result = await availabilityService.checkAvailability(
        mockTenantId,
        testDate,
        mockTechnicianId,
        120
      );

      expect(result).toBeDefined();
      expect(result.technician).toEqual(mockTechnician);
      expect(result.conflicts).toEqual([]);
      expect(result.availableSlots.length).toBeGreaterThan(0);
      expect(mockDb.getTechnicianById).toHaveBeenCalledWith(mockTechnicianId);
    });

    it('should throw error when technician not found', async () => {
      mockDb.getTechnicianById.mockResolvedValue(null);

      await expect(
        availabilityService.checkAvailability(
          mockTenantId,
          testDate,
          mockTechnicianId,
          120
        )
      ).rejects.toThrow('Technician not found');
    });

    it('should detect conflicts with existing bookings', async () => {
      const mockTechnician = {
        id: mockTechnicianId,
        name: 'John Test',
        availability: {
          tue: { start: '09:00', end: '17:00' }
        }
      };

      const mockBooking = {
        id: 'booking-1',
        technicianId: mockTechnicianId,
        preferredTime: '10:00',
        estimatedDuration: 120,
        customerName: 'Test Customer'
      };

      mockDb.getTechnicianById.mockResolvedValue(mockTechnician as any);
      mockDb.query.mockResolvedValue([mockBooking]);

      const result = await availabilityService.checkAvailability(
        mockTenantId,
        testDate,
        mockTechnicianId,
        120
      );

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toEqual(mockBooking);
      expect(result.unavailableSlots.length).toBeGreaterThan(0);
    });
  });

  describe('findNextAvailableSlot', () => {
    it('should return null when no technicians available', async () => {
      mockDb.findBestTechnicianForService.mockResolvedValue([]);

      const result = await availabilityService.findNextAvailableSlot(
        mockTenantId,
        'termite inspection',
        120,
        false
      );

      expect(result).toBeNull();
    });

    it('should find next available slot for emergency services', async () => {
      const mockTechnician = {
        id: mockTechnicianId,
        name: 'Emergency Tech',
        emergencyContact: true,
        availability: {
          tue: { start: '09:00', end: '17:00' }
        }
      };

      mockDb.findBestTechnicianForService.mockResolvedValue([mockTechnician as any]);
      mockDb.query.mockResolvedValue([]); // No conflicts

      const result = await availabilityService.findNextAvailableSlot(
        mockTenantId,
        'termite emergency',
        120,
        true,
        testDate
      );

      expect(result).toBeDefined();
      expect(result?.technician).toEqual(mockTechnician);
      expect(result?.timeSlot).toBeDefined();
      expect(result?.date).toBeDefined();
    });
  });

  describe('checkBookingConflicts', () => {
    it('should return no conflicts when no overlapping bookings exist', async () => {
      mockDb.query.mockResolvedValue([]);

      const result = await availabilityService.checkBookingConflicts(
        mockTenantId,
        testDate,
        '10:00',
        120
      );

      expect(result.hasConflicts).toBe(false);
      expect(result.conflicts).toEqual([]);
    });

    it('should detect conflicts with overlapping bookings', async () => {
      const mockOverlappingBooking = {
        id: 'conflict-booking',
        preferredTime: '11:00',
        estimatedDuration: 120
      };

      mockDb.query.mockResolvedValue([mockOverlappingBooking]);

      const result = await availabilityService.checkBookingConflicts(
        mockTenantId,
        testDate,
        '10:00',
        120
      );

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
    });
  });

  describe('getTechnicianWorkload', () => {
    it('should calculate technician workload correctly', async () => {
      const mockTechnician = {
        id: mockTechnicianId,
        name: 'Busy Tech',
        availability: {
          tue: { start: '09:00', end: '17:00' } // 8 hours
        }
      };

      const mockBookings = [
        { estimatedDuration: 120 }, // 2 hours
        { estimatedDuration: 180 }  // 3 hours
      ];

      mockDb.getTechnicianById.mockResolvedValue(mockTechnician as any);
      mockDb.getTechnicianBookingsForDate.mockResolvedValue(mockBookings as any);

      const result = await availabilityService.getTechnicianWorkload(
        mockTechnicianId,
        testDate
      );

      expect(result.technician).toEqual(mockTechnician);
      expect(result.totalBookings).toBe(2);
      expect(result.totalHours).toBe(5); // 2 + 3 hours
      expect(result.utilization).toBe(62.5); // 5/8 * 100
    });

    it('should throw error when technician not found', async () => {
      mockDb.getTechnicianById.mockResolvedValue(null);

      await expect(
        availabilityService.getTechnicianWorkload(mockTechnicianId, testDate)
      ).rejects.toThrow('Technician not found');
    });
  });
});