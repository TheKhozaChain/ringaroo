import { Pool, PoolClient } from 'pg';
import { appConfig } from '@/config';
import type { Tenant, Call, Booking, KnowledgeChunk } from '@/types';

class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: appConfig.databaseUrl,
      ssl: appConfig.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // Increased from 2s to 10s
    });
    
    // Add error handler for the pool
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Tenant operations
  async getTenantByPhoneNumber(phoneNumber: string): Promise<Tenant | null> {
    const result = await this.query<Tenant>(
      'SELECT * FROM ringaroo.tenants WHERE phone_number = $1',
      [phoneNumber]
    );
    return result[0] || null;
  }

  async getTenantById(id: string): Promise<Tenant | null> {
    const result = await this.query<Tenant>(
      'SELECT * FROM ringaroo.tenants WHERE id = $1',
      [id]
    );
    return result[0] || null;
  }

  // Call operations
  async createCall(call: Omit<Call, 'id' | 'createdAt'>): Promise<Call> {
    const result = await this.query<Call>(
      `INSERT INTO ringaroo.calls 
       (tenant_id, twilio_call_sid, caller_number, status, transcript, actions, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        call.tenantId,
        call.twilioCallSid,
        call.callerNumber,
        call.status,
        JSON.stringify(call.transcript),
        JSON.stringify(call.actions),
        call.startedAt,
      ]
    );
    return result[0]!;
  }

  async updateCall(callId: string, updates: Partial<Call>): Promise<Call | null> {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const values = [callId, ...Object.values(updates)];
    
    const result = await this.query<Call>(
      `UPDATE ringaroo.calls SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      values
    );
    return result[0] || null;
  }

  async getCallByTwilioSid(twilioCallSid: string): Promise<Call | null> {
    const result = await this.query<Call>(
      'SELECT * FROM ringaroo.calls WHERE twilio_call_sid = $1',
      [twilioCallSid]
    );
    return result[0] || null;
  }

  // Booking operations
  async createBooking(booking: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>): Promise<Booking> {
    const result = await this.query<Booking>(
      `INSERT INTO ringaroo.bookings 
       (tenant_id, call_id, customer_name, customer_phone, customer_email, 
        service_type, preferred_date, preferred_time, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        booking.tenantId,
        booking.callId,
        booking.customerName,
        booking.customerPhone,
        booking.customerEmail,
        booking.serviceType,
        booking.preferredDate,
        booking.preferredTime,
        booking.notes,
        booking.status,
      ]
    );
    return result[0]!;
  }

  async updateBooking(bookingId: string, updates: Partial<Booking>): Promise<Booking | null> {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const values = [bookingId, ...Object.values(updates)];
    
    const result = await this.query<Booking>(
      `UPDATE ringaroo.bookings SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      values
    );
    return result[0] || null;
  }

  // Knowledge operations
  async searchKnowledge(tenantId: string, query: string, limit = 5): Promise<KnowledgeChunk[]> {
    // This would typically use vector similarity search
    // For now, we'll use basic text search as a fallback
    const result = await this.query<KnowledgeChunk>(
      `SELECT id, tenant_id, content, token_count, metadata, created_at
       FROM ringaroo.knowledge_chunks 
       WHERE tenant_id = $1 
       AND content ILIKE $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [tenantId, `%${query}%`, limit]
    );
    return result;
  }

  async getKnowledgeByTenant(tenantId: string): Promise<KnowledgeChunk[]> {
    const result = await this.query<KnowledgeChunk>(
      `SELECT * FROM ringaroo.knowledge_chunks 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC`,
      [tenantId]
    );
    return result;
  }

  async addKnowledgeChunk(
    chunk: Omit<KnowledgeChunk, 'id' | 'createdAt'>,
    sourceId: string
  ): Promise<KnowledgeChunk> {
    const result = await this.query<KnowledgeChunk>(
      `INSERT INTO ringaroo.knowledge_chunks 
       (knowledge_source_id, tenant_id, content, embedding, token_count, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        sourceId,
        chunk.tenantId,
        chunk.content,
        chunk.embedding ? JSON.stringify(chunk.embedding) : null,
        chunk.tokenCount,
        JSON.stringify(chunk.metadata),
      ]
    );
    return result[0]!;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Dashboard operations
  async getCalls(limit = 50): Promise<Call[]> {
    const result = await this.query<Call>(
      `SELECT * FROM ringaroo.calls 
       ORDER BY started_at DESC 
       LIMIT $1`,
      [limit]
    );
    return result;
  }

  async getDashboardStats(): Promise<{
    totalCalls: number;
    activeCalls: number;
    totalBookings: number;
    pendingBookings: number;
    recentCalls: Call[];
  }> {
    const [totalCallsResult, activeCallsResult, totalBookingsResult, pendingBookingsResult, recentCallsResult] = await Promise.all([
      this.query('SELECT COUNT(*) as count FROM ringaroo.calls'),
      this.query("SELECT COUNT(*) as count FROM ringaroo.calls WHERE status = 'in_progress'"),
      this.query('SELECT COUNT(*) as count FROM ringaroo.bookings'),
      this.query("SELECT COUNT(*) as count FROM ringaroo.bookings WHERE status = 'pending'"),
      this.query('SELECT * FROM ringaroo.calls ORDER BY started_at DESC LIMIT 5'),
    ]);

    return {
      totalCalls: parseInt(totalCallsResult[0]?.count || '0'),
      activeCalls: parseInt(activeCallsResult[0]?.count || '0'),
      totalBookings: parseInt(totalBookingsResult[0]?.count || '0'),
      pendingBookings: parseInt(pendingBookingsResult[0]?.count || '0'),
      recentCalls: recentCallsResult,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}

export const db = new DatabaseService();
export default DatabaseService; 