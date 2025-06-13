const nodemailer = require('nodemailer');
import { appConfig } from '@/config';
import type { Booking } from '@/types';

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromEmail: string;
  fromName: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private config: EmailConfig | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    // For demo purposes, we'll use a mock transporter if no real email config
    // In production, this would use real SMTP credentials
    const emailConfig = this.getEmailConfig();
    
    if (emailConfig) {
      this.config = emailConfig;
      this.transporter = nodemailer.createTransport({
        host: emailConfig.smtpHost,
        port: emailConfig.smtpPort,
        secure: emailConfig.smtpPort === 465,
        auth: {
          user: emailConfig.smtpUser,
          pass: emailConfig.smtpPass,
        },
      });
      console.log('Email service initialized with SMTP configuration');
    } else {
      // Demo mode - log emails instead of sending
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true
      });
      console.log('Email service initialized in demo mode (emails will be logged)');
    }
  }

  private getEmailConfig(): EmailConfig | null {
    // Check environment variables for email configuration
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      return {
        smtpHost: process.env.SMTP_HOST,
        smtpPort: parseInt(process.env.SMTP_PORT || '587'),
        smtpUser: process.env.SMTP_USER,
        smtpPass: process.env.SMTP_PASS,
        fromEmail: process.env.FROM_EMAIL || process.env.SMTP_USER,
        fromName: process.env.FROM_NAME || 'Ringaroo Booking System'
      };
    }
    return null;
  }

  /**
   * Send booking confirmation email to customer
   */
  async sendBookingConfirmation(booking: Booking, businessName: string = 'Aussie Business Services'): Promise<boolean> {
    if (!this.transporter) {
      console.error('Email service not initialized');
      return false;
    }

    try {
      // Handle both camelCase and snake_case field names from database
      const customerName = (booking as any).customer_name || booking.customerName;
      const customerPhone = (booking as any).customer_phone || booking.customerPhone;
      const customerEmail = (booking as any).customer_email || booking.customerEmail;
      const serviceType = (booking as any).service_type || booking.serviceType;
      const preferredDate = (booking as any).preferred_date || booking.preferredDate;
      const preferredTime = (booking as any).preferred_time || booking.preferredTime;

      // For now, if no customer email, we'll use a demo email for testing
      const emailAddress = customerEmail || 'demo@example.com';

      const dateStr = preferredDate ? 
        new Date(preferredDate).toLocaleDateString('en-AU') : 'To be confirmed';
      const timeStr = preferredTime || 'To be confirmed';

      const subject = `Booking Confirmation - ${businessName}`;
      const htmlContent = this.generateBookingEmailHtml(
        customerName,
        customerPhone,
        serviceType,
        dateStr,
        timeStr,
        businessName,
        booking.id
      );

      const textContent = this.generateBookingEmailText(
        customerName,
        customerPhone,
        serviceType,
        dateStr,
        timeStr,
        businessName,
        booking.id
      );

      const mailOptions = {
        from: this.config ? `${this.config.fromName} <${this.config.fromEmail}>` : 'noreply@demo.com',
        to: emailAddress,
        subject,
        text: textContent,
        html: htmlContent,
      };

      if (this.config) {
        // Real email sending
        const result = await this.transporter.sendMail(mailOptions);
        console.log(`Booking confirmation email sent to ${emailAddress}:`, result.messageId);
        return true;
      } else {
        // Demo mode - log the email
        console.log('\n=== BOOKING CONFIRMATION EMAIL (DEMO MODE) ===');
        console.log(`To: ${emailAddress}`);
        console.log(`Subject: ${subject}`);
        console.log(`Content:\n${textContent}`);
        console.log('=== END EMAIL ===\n');
        return true;
      }
    } catch (error) {
      console.error('Failed to send booking confirmation email:', error);
      return false;
    }
  }

  /**
   * Send booking notification to business owner
   */
  async sendBookingNotificationToBusiness(booking: Booking, businessEmail: string, businessName: string = 'Aussie Business Services'): Promise<boolean> {
    if (!this.transporter) {
      console.error('Email service not initialized');
      return false;
    }

    try {
      // Handle both camelCase and snake_case field names from database
      const customerName = (booking as any).customer_name || booking.customerName;
      const customerPhone = (booking as any).customer_phone || booking.customerPhone;
      const customerEmail = (booking as any).customer_email || booking.customerEmail;
      const serviceType = (booking as any).service_type || booking.serviceType;
      const preferredDate = (booking as any).preferred_date || booking.preferredDate;
      const preferredTime = (booking as any).preferred_time || booking.preferredTime;

      const dateStr = preferredDate ? 
        new Date(preferredDate).toLocaleDateString('en-AU') : 'To be confirmed';
      const timeStr = preferredTime || 'To be confirmed';

      const subject = `New Booking Request - ${customerName}`;
      const htmlContent = this.generateBusinessNotificationEmailHtml(
        customerName,
        customerPhone,
        customerEmail,
        serviceType,
        dateStr,
        timeStr,
        businessName,
        booking.id
      );

      const textContent = this.generateBusinessNotificationEmailText(
        customerName,
        customerPhone,
        customerEmail,
        serviceType,
        dateStr,
        timeStr,
        businessName,
        booking.id
      );

      const mailOptions = {
        from: this.config ? `${this.config.fromName} <${this.config.fromEmail}>` : 'noreply@demo.com',
        to: businessEmail,
        subject,
        text: textContent,
        html: htmlContent,
      };

      if (this.config) {
        // Real email sending
        const result = await this.transporter.sendMail(mailOptions);
        console.log(`Business notification email sent to ${businessEmail}:`, result.messageId);
        return true;
      } else {
        // Demo mode - log the email
        console.log('\n=== BUSINESS NOTIFICATION EMAIL (DEMO MODE) ===');
        console.log(`To: ${businessEmail}`);
        console.log(`Subject: ${subject}`);
        console.log(`Content:\n${textContent}`);
        console.log('=== END EMAIL ===\n');
        return true;
      }
    } catch (error) {
      console.error('Failed to send business notification email:', error);
      return false;
    }
  }

  private generateBookingEmailHtml(
    customerName: string,
    customerPhone: string,
    serviceType: string,
    dateStr: string,
    timeStr: string,
    businessName: string,
    bookingId: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9f9f9; padding: 20px; }
          .booking-details { background-color: white; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Booking Confirmation</h1>
          </div>
          <div class="content">
            <p>G'day ${customerName}!</p>
            <p>Thanks for your booking request with ${businessName}. We've received your details and someone will be in touch shortly to confirm your appointment.</p>
            
            <div class="booking-details">
              <h3>Your Booking Details</h3>
              <p><strong>Name:</strong> ${customerName}</p>
              <p><strong>Phone:</strong> ${customerPhone}</p>
              <p><strong>Service:</strong> ${serviceType}</p>
              <p><strong>Preferred Date:</strong> ${dateStr}</p>
              <p><strong>Preferred Time:</strong> ${timeStr}</p>
              <p><strong>Booking Reference:</strong> ${bookingId.substring(0, 8)}</p>
            </div>
            
            <p>We'll call you on ${customerPhone} to confirm the exact time and answer any questions you might have.</p>
            <p>If you need to make any changes, please call us back on the number you just called.</p>
            
            <p>Thanks again!</p>
            <p><strong>The ${businessName} Team</strong></p>
          </div>
          <div class="footer">
            <p>This confirmation was sent automatically by Ringaroo</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateBookingEmailText(
    customerName: string,
    customerPhone: string,
    serviceType: string,
    dateStr: string,
    timeStr: string,
    businessName: string,
    bookingId: string
  ): string {
    return `
G'day ${customerName}!

Thanks for your booking request with ${businessName}. We've received your details and someone will be in touch shortly to confirm your appointment.

Your Booking Details:
- Name: ${customerName}
- Phone: ${customerPhone}
- Service: ${serviceType}
- Preferred Date: ${dateStr}
- Preferred Time: ${timeStr}
- Booking Reference: ${bookingId.substring(0, 8)}

We'll call you on ${customerPhone} to confirm the exact time and answer any questions you might have.

If you need to make any changes, please call us back on the number you just called.

Thanks again!
The ${businessName} Team

---
This confirmation was sent automatically by Ringaroo
    `.trim();
  }

  private generateBusinessNotificationEmailHtml(
    customerName: string,
    customerPhone: string,
    customerEmail: string | null,
    serviceType: string,
    dateStr: string,
    timeStr: string,
    businessName: string,
    bookingId: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9f9f9; padding: 20px; }
          .booking-details { background-color: white; padding: 15px; border-left: 4px solid #2196F3; margin: 20px 0; }
          .action-required { background-color: #FFF3CD; border: 1px solid #FFE69C; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Booking Request</h1>
          </div>
          <div class="content">
            <p>You have a new booking request for ${businessName}!</p>
            
            <div class="booking-details">
              <h3>Customer Details</h3>
              <p><strong>Name:</strong> ${customerName}</p>
              <p><strong>Phone:</strong> ${customerPhone}</p>
              ${customerEmail ? `<p><strong>Email:</strong> ${customerEmail}</p>` : ''}
              <p><strong>Service Requested:</strong> ${serviceType}</p>
              <p><strong>Preferred Date:</strong> ${dateStr}</p>
              <p><strong>Preferred Time:</strong> ${timeStr}</p>
              <p><strong>Booking ID:</strong> ${bookingId}</p>
            </div>
            
            <div class="action-required">
              <h4>Action Required</h4>
              <p>Please call ${customerName} on ${customerPhone} to confirm their appointment and finalize the booking details.</p>
            </div>
            
            <p>The customer has been sent an automatic confirmation email letting them know you'll be in touch.</p>
          </div>
          <div class="footer">
            <p>This notification was sent automatically by Ringaroo</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateBusinessNotificationEmailText(
    customerName: string,
    customerPhone: string,
    customerEmail: string | null,
    serviceType: string,
    dateStr: string,
    timeStr: string,
    businessName: string,
    bookingId: string
  ): string {
    return `
New Booking Request for ${businessName}

Customer Details:
- Name: ${customerName}
- Phone: ${customerPhone}
${customerEmail ? `- Email: ${customerEmail}` : ''}
- Service Requested: ${serviceType}
- Preferred Date: ${dateStr}
- Preferred Time: ${timeStr}
- Booking ID: ${bookingId}

ACTION REQUIRED:
Please call ${customerName} on ${customerPhone} to confirm their appointment and finalize the booking details.

The customer has been sent an automatic confirmation email letting them know you'll be in touch.

---
This notification was sent automatically by Ringaroo
    `.trim();
  }

  /**
   * Test email connectivity
   */
  async testConnection(): Promise<boolean> {
    if (!this.transporter || !this.config) {
      console.log('Email service running in demo mode - no real SMTP configuration');
      return true; // Demo mode is always "working"
    }

    try {
      await this.transporter.verify();
      console.log('Email service connection test successful');
      return true;
    } catch (error) {
      console.error('Email service connection test failed:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();