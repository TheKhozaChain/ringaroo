import { FastifyPluginAsync } from 'fastify';
import axios from 'axios';
import { db } from '@/services/database';
import { appConfig } from '@/config';
import type { ClinikoAppointment, ClinikoPatient, Booking } from '@/types';

const actionsRoutes: FastifyPluginAsync = async function (fastify) {
  // Book appointment via Cliniko API
  fastify.post('/actions/book', async (request, reply) => {
    const {
      tenantId,
      customerName,
      customerPhone,
      customerEmail,
      serviceType,
      preferredDate,
      preferredTime,
      notes,
    } = request.body as {
      tenantId: string;
      customerName: string;
      customerPhone: string;
      customerEmail: string;
      serviceType: string;
      preferredDate: string;
      preferredTime: string;
      notes?: string;
    };

    try {
      // Get tenant settings for Cliniko integration
      const tenant = await db.getTenantById(tenantId);
      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }

      const { clinikoApiKey, clinikoBaseUrl } = tenant.settings;
      
      if (!clinikoApiKey || !clinikoBaseUrl) {
        // Fallback to email booking
        const booking = await createEmailBooking({
          tenantId,
          customerName,
          customerPhone,
          customerEmail,
          serviceType,
          preferredDate,
          preferredTime,
          notes,
        });
        
        return reply.send({
          success: true,
          bookingId: booking.id,
          method: 'email',
          message: 'Booking request sent via email',
        });
      }

      // Try Cliniko API booking
      const clinikoResult = await bookWithCliniko({
        apiKey: clinikoApiKey,
        baseUrl: clinikoBaseUrl,
        customerName,
        customerPhone,
        customerEmail,
        serviceType,
        preferredDate,
        preferredTime,
        notes,
      });

      // Create booking record
      const booking = await db.createBooking({
        tenantId,
        customerName,
        customerPhone,
        customerEmail,
        serviceType,
        preferredDate: new Date(preferredDate),
        preferredTime,
        notes,
        estimatedDuration: 60,
        priorityLevel: 'normal',
        status: 'confirmed',
        externalBookingId: clinikoResult.appointmentId,
      });

      reply.send({
        success: true,
        bookingId: booking.id,
        externalId: clinikoResult.appointmentId,
        method: 'cliniko',
        message: 'Appointment booked successfully',
      });

    } catch (error) {
      fastify.log.error('Booking error:', error);
      
      // Fallback to email booking on error
      try {
        const booking = await createEmailBooking({
          tenantId,
          customerName,
          customerPhone,
          customerEmail,
          serviceType,
          preferredDate,
          preferredTime,
          notes,
        });
        
        reply.send({
          success: true,
          bookingId: booking.id,
          method: 'email_fallback',
          message: 'Booking request sent via email (Cliniko unavailable)',
        });
      } catch (fallbackError) {
        reply.status(500).send({
          success: false,
          error: 'Failed to create booking',
        });
      }
    }
  });

  // Get booking status
  fastify.get('/actions/booking/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const booking = await db.query('SELECT * FROM ringaroo.bookings WHERE id = $1', [id]);
      
      if (!booking[0]) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      reply.send({ booking: booking[0] });
    } catch (error) {
      fastify.log.error('Get booking error:', error);
      reply.status(500).send({ error: 'Failed to get booking' });
    }
  });
};

// Cliniko API integration
interface ClinikoBookingParams {
  apiKey: string;
  baseUrl: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceType: string;
  preferredDate: string;
  preferredTime: string;
  notes?: string;
}

async function bookWithCliniko(params: ClinikoBookingParams) {
  const {
    apiKey,
    baseUrl,
    customerName,
    customerPhone,
    customerEmail,
    serviceType,
    preferredDate,
    preferredTime,
    notes,
  } = params;

  const headers = {
    'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Parse customer name
  const nameParts = customerName.trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // 1. Find or create patient
  let patientId: string;
  
  try {
    // Search for existing patient by email
    const searchResponse = await axios.get(`${baseUrl}/patients`, {
      headers,
      params: { q: customerEmail },
    });

    const existingPatients = searchResponse.data.patients || [];
    
    if (existingPatients.length > 0) {
      patientId = existingPatients[0].id;
    } else {
      // Create new patient
      const newPatient: ClinikoPatient = {
        first_name: firstName,
        last_name: lastName,
        phone_number: customerPhone,
        email: customerEmail,
      };

      const createResponse = await axios.post(`${baseUrl}/patients`, newPatient, { headers });
      patientId = createResponse.data.patient.id;
    }
  } catch (error) {
    console.error('Error managing patient:', error);
    throw new Error('Failed to find or create patient');
  }

  // 2. Create appointment
  try {
    const appointmentDateTime = new Date(`${preferredDate}T${preferredTime}`);
    const appointmentEnd = new Date(appointmentDateTime.getTime() + 60 * 60 * 1000); // 1 hour later

    const appointment: ClinikoAppointment = {
      appointment_start: appointmentDateTime.toISOString(),
      appointment_end: appointmentEnd.toISOString(),
      patient_id: patientId,
      notes: `${serviceType}${notes ? `\n${notes}` : ''}`,
    };

    const response = await axios.post(`${baseUrl}/appointments`, appointment, { headers });
    
    return {
      appointmentId: response.data.appointment.id,
      patientId,
    };
  } catch (error) {
    console.error('Error creating appointment:', error);
    throw new Error('Failed to create appointment');
  }
}

// Email booking fallback
async function createEmailBooking(bookingData: {
  tenantId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceType: string;
  preferredDate: string;
  preferredTime: string;
  notes?: string;
}): Promise<Booking> {
  // Create booking record with pending status
  const booking = await db.createBooking({
    ...bookingData,
    preferredDate: new Date(bookingData.preferredDate),
    estimatedDuration: 60,
    priorityLevel: 'normal',
    status: 'pending',
  });

  // TODO: Send email to business owner
  console.log('Email booking created:', booking.id);
  
  return booking;
}

export default actionsRoutes; 