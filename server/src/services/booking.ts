import { db } from './database';
import { emailService } from './email';
import type { Booking } from '@/types';

export interface BookingRequest {
  tenantId: string;
  twilioCallSid?: string; // Store Twilio CallSid separately, don't use as call_id
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  serviceType?: string;
  preferredDate?: string; // Will be parsed to Date
  preferredTime?: string;
  notes?: string;
}

export interface BookingValidation {
  isValid: boolean;
  missingFields: string[];
  errors: string[];
}

export class BookingService {
  
  /**
   * Create a new booking from conversation data
   */
  async createBooking(request: BookingRequest): Promise<Booking> {
    console.log('Creating booking:', request);
    
    // Parse preferred date if provided
    let preferredDate: Date | undefined;
    if (request.preferredDate) {
      preferredDate = this.parseDate(request.preferredDate);
    }
    
    // For now, we'll set callId to null since we'd need to look up the Call UUID
    // In the future, we could look up the call by twilioCallSid if needed
    const booking: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'> = {
      tenantId: request.tenantId,
      callId: null, // Set to null for now, can be linked later if needed
      customerName: request.customerName || null,
      customerPhone: request.customerPhone || null,
      customerEmail: request.customerEmail || null,
      serviceType: request.serviceType || null,
      preferredDate: preferredDate || null,
      preferredTime: request.preferredTime || null,
      notes: request.twilioCallSid ? `Call SID: ${request.twilioCallSid}` : null,
      status: 'pending',
      externalBookingId: null
    };
    
    const createdBooking = await db.createBooking(booking);
    
    // Send email notifications asynchronously (don't wait for them to complete)
    this.sendBookingNotifications(createdBooking).catch(error => {
      console.error('Failed to send booking notifications:', error);
    });
    
    return createdBooking;
  }
  
  /**
   * Validate booking information completeness
   */
  validateBooking(request: BookingRequest): BookingValidation {
    const missingFields: string[] = [];
    const errors: string[] = [];
    
    // Check required fields
    if (!request.customerName || request.customerName.trim().length === 0) {
      missingFields.push('customer name');
    }
    
    if (!request.customerPhone || request.customerPhone.trim().length === 0) {
      missingFields.push('phone number');
    }
    
    if (!request.serviceType || request.serviceType.trim().length === 0) {
      missingFields.push('service type');
    }
    
    // Validate phone number format (basic validation)
    if (request.customerPhone && !this.isValidPhoneNumber(request.customerPhone)) {
      errors.push('phone number format is invalid');
    }
    
    // Validate email format if provided
    if (request.customerEmail && !this.isValidEmail(request.customerEmail)) {
      errors.push('email format is invalid');
    }
    
    // Validate date if provided
    if (request.preferredDate && !this.parseDate(request.preferredDate)) {
      errors.push('preferred date format is invalid');
    }
    
    return {
      isValid: missingFields.length === 0 && errors.length === 0,
      missingFields,
      errors
    };
  }
  
  /**
   * Get next questions to ask based on missing information
   */
  getNextBookingQuestion(request: BookingRequest): string | null {
    const validation = this.validateBooking(request);
    
    if (!request.customerName) {
      return "Great! I'd be happy to help you book an appointment. What's your name?";
    }
    
    if (!request.customerPhone) {
      return "Thanks! What's the best phone number to reach you on?";
    }
    
    if (!request.serviceType) {
      return "Perfect! What service would you like to book?";
    }
    
    if (!request.preferredDate && !request.preferredTime) {
      return "Excellent! When would you prefer your appointment? You can tell me a date and time.";
    }
    
    if (!request.preferredDate) {
      return "Great! What date would work best for you?";
    }
    
    if (!request.preferredTime) {
      return "Perfect! What time would you prefer?";
    }
    
    // All required info collected
    return null;
  }
  
  /**
   * Generate booking confirmation message
   */
  generateBookingConfirmation(booking: Booking): string {
    const preferredDate = (booking as any).preferred_date || booking.preferredDate;
    const preferredTime = (booking as any).preferred_time || booking.preferredTime;
    const dateStr = preferredDate ? 
      new Date(preferredDate).toLocaleDateString('en-AU') : 'to be confirmed';
    const timeStr = preferredTime || 'to be confirmed';
    
    return `Perfect! I've got your booking request:
    
Name: ${(booking as any).customer_name || booking.customerName}
Phone: ${(booking as any).customer_phone || booking.customerPhone}
Service: ${(booking as any).service_type || booking.serviceType}
Preferred Date: ${dateStr}
Preferred Time: ${timeStr}

We'll send you a confirmation email shortly and someone will call you to confirm the details. Is there anything else I can help you with?`;
  }
  
  /**
   * Check if booking information is complete enough to submit
   */
  isBookingComplete(request: BookingRequest): boolean {
    return !!(request.customerName && 
             request.customerPhone && 
             request.serviceType);
  }
  
  /**
   * Parse date from natural language input
   */
  private parseDate(dateStr: string): Date | null {
    try {
      // Handle common formats
      const cleanDateStr = dateStr.toLowerCase().trim();
      
      // Handle relative dates
      if (cleanDateStr.includes('today')) {
        return new Date();
      }
      if (cleanDateStr.includes('tomorrow')) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
      }
      if (cleanDateStr.includes('next week')) {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        return nextWeek;
      }
      
      // Try parsing as standard date
      const parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) {
        return null;
      }
      
      // Don't allow dates in the past (more than 1 day ago)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (parsed < yesterday) {
        return null;
      }
      
      return parsed;
    } catch (error) {
      console.error('Date parsing error:', error);
      return null;
    }
  }
  
  /**
   * Basic phone number validation
   */
  private isValidPhoneNumber(phone: string): boolean {
    // Remove spaces, dashes, parentheses
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    
    // Check for basic phone number patterns
    const phoneRegex = /^(\+61|0)[0-9]{8,9}$/; // Australian format
    const intlRegex = /^\+[1-9]\d{1,14}$/; // International format
    
    return phoneRegex.test(cleaned) || intlRegex.test(cleaned);
  }
  
  /**
   * Basic email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  /**
   * Send booking notification emails
   */
  private async sendBookingNotifications(booking: Booking): Promise<void> {
    try {
      const businessEmail = 'demo@business.com'; // In production, get from tenant settings
      const businessName = 'Aussie Business Services'; // In production, get from tenant settings
      
      // Send confirmation email to customer (if they provided email)
      const customerEmail = (booking as any).customer_email || booking.customerEmail;
      if (customerEmail) {
        await emailService.sendBookingConfirmation(booking, businessName);
      } else {
        // Always send booking confirmation info to demo email for testing
        console.log('No customer email provided, sending demo confirmation email');
        await emailService.sendBookingConfirmation(booking, businessName);
      }
      
      // Send notification to business owner
      await emailService.sendBookingNotificationToBusiness(booking, businessEmail, businessName);
      
      console.log('Booking notification emails sent successfully');
    } catch (error) {
      console.error('Error sending booking notifications:', error);
      throw error;
    }
  }
  
  /**
   * Get all bookings for a tenant
   */
  async getBookings(tenantId: string, limit = 50): Promise<Booking[]> {
    return await db.query<Booking>(
      `SELECT * FROM ringaroo.bookings 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [tenantId, limit]
    );
  }
  
  /**
   * Update booking status
   */
  async updateBookingStatus(bookingId: string, status: 'pending' | 'confirmed' | 'cancelled', notes?: string): Promise<Booking | null> {
    const updates: Partial<Booking> = { status };
    if (notes) {
      updates.notes = notes;
    }
    
    return await db.updateBooking(bookingId, updates);
  }
}

export const bookingService = new BookingService();