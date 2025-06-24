import { db } from './database'
import type { Technician, Booking } from '@/types'

export interface TimeSlot {
  start: string // HH:MM format
  end: string   // HH:MM format
  available: boolean
  reason?: string
  technicianId?: string
  technicianName?: string
}

export interface AvailabilityCheck {
  date: Date
  technician?: Technician
  conflicts: Booking[]
  availableSlots: TimeSlot[]
  unavailableSlots: TimeSlot[]
}

class AvailabilityService {
  
  /**
   * Check availability for a specific date and optionally a technician
   */
  async checkAvailability(
    tenantId: string, 
    date: Date, 
    technicianId?: string,
    serviceDuration: number = 120 // Default 2 hours in minutes
  ): Promise<AvailabilityCheck> {
    
    const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()]
    
    let technician: Technician | undefined
    let technicians: Technician[] = []
    
    if (technicianId) {
      technician = await db.getTechnicianById(technicianId)
      if (!technician) {
        throw new Error('Technician not found')
      }
      technicians = [technician]
    } else {
      technicians = await db.getTechniciansAvailableForDate(tenantId, date)
    }
    
    // Get all existing bookings for the date
    const allBookings = await db.query<Booking>(
      `SELECT * FROM ringaroo.bookings 
       WHERE tenant_id = $1 
       AND preferred_date = $2 
       AND status IN ('confirmed', 'in_progress')
       ORDER BY preferred_time`,
      [tenantId, date.toISOString().split('T')[0]]
    )
    
    const conflicts = technicianId 
      ? allBookings.filter(b => b.technicianId === technicianId)
      : allBookings
    
    // Generate time slots based on business hours and technician availability
    const availableSlots: TimeSlot[] = []
    const unavailableSlots: TimeSlot[] = []
    
    for (const tech of technicians) {
      const dayAvailability = tech.availability[dayOfWeek]
      if (!dayAvailability) continue
      
      const workStart = this.parseTime(dayAvailability.start)
      const workEnd = this.parseTime(dayAvailability.end)
      
      // Generate 30-minute slots throughout the work day
      for (let time = workStart; time < workEnd; time += 30) {
        const slotStart = this.formatTime(time)
        const slotEnd = this.formatTime(time + serviceDuration)
        
        // Check if this slot extends beyond work hours
        if (time + serviceDuration > workEnd) {
          unavailableSlots.push({
            start: slotStart,
            end: this.formatTime(workEnd),
            available: false,
            reason: 'Extends beyond work hours',
            technicianId: tech.id,
            technicianName: tech.name
          })
          continue
        }
        
        // Check for conflicts with existing bookings
        const hasConflict = allBookings.some(booking => {
          if (booking.technicianId !== tech.id) return false
          
          if (!booking.preferredTime) return false
          
          const bookingStart = this.parseTime(booking.preferredTime)
          const bookingEnd = bookingStart + (booking.estimatedDuration || 120)
          
          // Check if there's any overlap
          return !(time + serviceDuration <= bookingStart || time >= bookingEnd)
        })
        
        if (hasConflict) {
          const conflictingBooking = allBookings.find(booking => {
            if (booking.technicianId !== tech.id) return false
            if (!booking.preferredTime) return false
            
            const bookingStart = this.parseTime(booking.preferredTime)
            const bookingEnd = bookingStart + (booking.estimatedDuration || 120)
            
            return !(time + serviceDuration <= bookingStart || time >= bookingEnd)
          })
          
          unavailableSlots.push({
            start: slotStart,
            end: slotEnd,
            available: false,
            reason: `Conflicts with ${conflictingBooking?.customerName || 'existing booking'}`,
            technicianId: tech.id,
            technicianName: tech.name
          })
        } else {
          availableSlots.push({
            start: slotStart,
            end: slotEnd,
            available: true,
            technicianId: tech.id,
            technicianName: tech.name
          })
        }
      }
    }
    
    return {
      date,
      technician,
      conflicts,
      availableSlots: this.removeDuplicateSlots(availableSlots),
      unavailableSlots: this.removeDuplicateSlots(unavailableSlots)
    }
  }
  
  /**
   * Find the next available time slot for a service
   */
  async findNextAvailableSlot(
    tenantId: string,
    serviceType: string,
    serviceDuration: number = 120,
    isEmergency: boolean = false,
    preferredDate?: Date
  ): Promise<{ date: Date; timeSlot: TimeSlot; technician: Technician } | null> {
    
    // Get recommended technicians for this service
    const technicians = await db.findBestTechnicianForService(tenantId, serviceType, isEmergency)
    
    if (technicians.length === 0) {
      return null
    }
    
    // Start checking from preferred date or today
    const startDate = preferredDate || new Date()
    
    // Check up to 14 days in advance
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const checkDate = new Date(startDate)
      checkDate.setDate(checkDate.getDate() + dayOffset)
      
      // Skip weekends unless it's an emergency
      if (!isEmergency && (checkDate.getDay() === 0 || checkDate.getDay() === 6)) {
        continue
      }
      
      for (const technician of technicians) {
        const availability = await this.checkAvailability(
          tenantId, 
          checkDate, 
          technician.id, 
          serviceDuration
        )
        
        if (availability.availableSlots.length > 0) {
          return {
            date: checkDate,
            timeSlot: availability.availableSlots[0],
            technician
          }
        }
      }
    }
    
    return null
  }
  
  /**
   * Check if a specific booking would cause conflicts
   */
  async checkBookingConflicts(
    tenantId: string,
    date: Date,
    startTime: string,
    duration: number,
    technicianId?: string,
    excludeBookingId?: string
  ): Promise<{ hasConflicts: boolean; conflicts: Booking[] }> {
    
    const startMinutes = this.parseTime(startTime)
    const endMinutes = startMinutes + duration
    
    let query = `
      SELECT * FROM ringaroo.bookings 
      WHERE tenant_id = $1 
      AND preferred_date = $2 
      AND preferred_time IS NOT NULL
      AND status IN ('confirmed', 'in_progress')
    `
    const params = [tenantId, date.toISOString().split('T')[0]]
    
    if (technicianId) {
      query += ` AND technician_id = $${params.length + 1}`
      params.push(technicianId)
    }
    
    if (excludeBookingId) {
      query += ` AND id != $${params.length + 1}`
      params.push(excludeBookingId)
    }
    
    const existingBookings = await db.query<Booking>(query, params)
    
    const conflicts = existingBookings.filter(booking => {
      const bookingStart = this.parseTime(booking.preferredTime!)
      const bookingEnd = bookingStart + (booking.estimatedDuration || 120)
      
      // Check for overlap
      return !(endMinutes <= bookingStart || startMinutes >= bookingEnd)
    })
    
    return {
      hasConflicts: conflicts.length > 0,
      conflicts
    }
  }
  
  /**
   * Get technician workload for a specific date
   */
  async getTechnicianWorkload(technicianId: string, date: Date): Promise<{
    technician: Technician
    totalBookings: number
    totalHours: number
    utilization: number // Percentage of work day used
    bookings: Booking[]
  }> {
    
    const technician = await db.getTechnicianById(technicianId)
    if (!technician) {
      throw new Error('Technician not found')
    }
    
    const bookings = await db.getTechnicianBookingsForDate(technicianId, date)
    
    const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()]
    const dayAvailability = technician.availability[dayOfWeek]
    
    let totalHours = 0
    let maxHours = 0
    
    if (dayAvailability) {
      const workStart = this.parseTime(dayAvailability.start)
      const workEnd = this.parseTime(dayAvailability.end)
      maxHours = (workEnd - workStart) / 60 // Convert minutes to hours
      
      totalHours = bookings.reduce((sum, booking) => {
        return sum + (booking.estimatedDuration || 120) / 60
      }, 0)
    }
    
    const utilization = maxHours > 0 ? (totalHours / maxHours) * 100 : 0
    
    return {
      technician,
      totalBookings: bookings.length,
      totalHours,
      utilization,
      bookings
    }
  }
  
  // Helper methods
  
  private parseTime(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number)
    return hours * 60 + minutes
  }
  
  private formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
  }
  
  private removeDuplicateSlots(slots: TimeSlot[]): TimeSlot[] {
    const seen = new Set<string>()
    return slots.filter(slot => {
      const key = `${slot.start}-${slot.end}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }
  
  /**
   * Get business hours for a tenant
   */
  async getBusinessHours(tenantId: string): Promise<Record<string, { start: string; end: string }>> {
    const tenant = await db.query<any>(
      'SELECT business_hours FROM ringaroo.tenants WHERE id = $1',
      [tenantId]
    )
    
    return tenant[0]?.business_hours || {
      mon: { start: '09:00', end: '17:00' },
      tue: { start: '09:00', end: '17:00' },
      wed: { start: '09:00', end: '17:00' },
      thu: { start: '09:00', end: '17:00' },
      fri: { start: '09:00', end: '17:00' }
    }
  }
}

export const availabilityService = new AvailabilityService()