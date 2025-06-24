import { Pool, PoolClient } from 'pg';
import { appConfig } from '@/config';
import type { Tenant, Call, Booking, KnowledgeChunk, Technician } from '@/types';
import { embeddingsService } from './embeddings';

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

  async getBookings(tenantId: string): Promise<Booking[]> {
    return this.query<Booking>(
      'SELECT * FROM ringaroo.bookings WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
  }

  async assignTechnician(bookingId: string, technicianId: string): Promise<Booking | null> {
    const result = await this.query<Booking>(
      `UPDATE ringaroo.bookings 
       SET technician_id = $1, assigned_at = NOW(), updated_at = NOW() 
       WHERE id = $2 RETURNING *`,
      [technicianId, bookingId]
    );
    return result[0] || null;
  }

  // Technician operations
  async getTechnicians(tenantId: string): Promise<Technician[]> {
    return this.query<Technician>(
      'SELECT * FROM ringaroo.technicians WHERE tenant_id = $1 AND is_active = true ORDER BY name',
      [tenantId]
    );
  }

  async getTechnicianById(technicianId: string): Promise<Technician | null> {
    const result = await this.query<Technician>(
      'SELECT * FROM ringaroo.technicians WHERE id = $1',
      [technicianId]
    );
    return result[0] || null;
  }

  async getTechniciansAvailableForDate(tenantId: string, date: Date): Promise<Technician[]> {
    const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()];
    
    return this.query<Technician>(
      `SELECT t.* FROM ringaroo.technicians t
       WHERE t.tenant_id = $1 
       AND t.is_active = true 
       AND t.availability->$2 IS NOT NULL`,
      [tenantId, dayOfWeek]
    );
  }

  async getTechnicianBookingsForDate(technicianId: string, date: Date): Promise<Booking[]> {
    return this.query<Booking>(
      `SELECT * FROM ringaroo.bookings 
       WHERE technician_id = $1 
       AND preferred_date = $2 
       AND status IN ('confirmed', 'in_progress')
       ORDER BY preferred_time`,
      [technicianId, date.toISOString().split('T')[0]]
    );
  }

  async findBestTechnicianForService(tenantId: string, serviceType: string, isEmergency: boolean = false): Promise<Technician[]> {
    const baseQuery = `
      SELECT t.*, 
             COALESCE(daily_bookings.count, 0) as current_bookings
      FROM ringaroo.technicians t
      LEFT JOIN (
        SELECT technician_id, COUNT(*) as count
        FROM ringaroo.bookings 
        WHERE preferred_date = CURRENT_DATE 
        AND status IN ('confirmed', 'in_progress')
        GROUP BY technician_id
      ) daily_bookings ON t.id = daily_bookings.technician_id
      WHERE t.tenant_id = $1 
      AND t.is_active = true
      AND COALESCE(daily_bookings.count, 0) < t.max_daily_bookings
    `;

    const params = [tenantId];
    let whereClause = '';

    if (isEmergency) {
      whereClause += ' AND t.emergency_contact = true';
    }

    if (serviceType) {
      whereClause += ` AND $${params.length + 1} = ANY(t.specialties)`;
      params.push(serviceType);
    }

    const orderClause = `
      ORDER BY 
        t.emergency_contact DESC,
        COALESCE(daily_bookings.count, 0) ASC,
        t.name
    `;

    return this.query<Technician & { current_bookings: number }>(
      baseQuery + whereClause + orderClause,
      params
    );
  }

  // Knowledge operations
  async searchKnowledge(tenantId: string, query: string, limit = 5, similarityThreshold = 0.7): Promise<Array<KnowledgeChunk & { similarity?: number }>> {
    try {
      console.log(`Searching knowledge for tenant ${tenantId} with query: "${query}"`);
      
      // Generate embedding for the search query
      const { embedding: queryEmbedding } = await embeddingsService.generateEmbedding(query);
      
      // Use vector similarity search with cosine distance
      const result = await this.query<KnowledgeChunk & { similarity: number }>(
        `SELECT 
           id, tenant_id, content, token_count, metadata, created_at,
           1 - (embedding <=> $2::vector) AS similarity
         FROM ringaroo.knowledge_chunks 
         WHERE tenant_id = $1 
         AND (1 - (embedding <=> $2::vector)) >= $3
         ORDER BY embedding <=> $2::vector
         LIMIT $4`,
        [tenantId, JSON.stringify(queryEmbedding), similarityThreshold, limit]
      );

      console.log(`Found ${result.length} knowledge chunks with similarity >= ${similarityThreshold}`);
      return result;

    } catch (error) {
      console.error('Vector search failed, falling back to text search:', error);
      
      // Fallback to basic text search if vector search fails
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
    try {
      console.log(`Adding knowledge chunk: "${chunk.content.substring(0, 100)}..."`);
      
      // Generate embedding if not provided
      let embedding = chunk.embedding;
      let tokenCount = chunk.tokenCount;
      
      if (!embedding) {
        const embeddingResult = await embeddingsService.generateEmbedding(chunk.content);
        embedding = embeddingResult.embedding;
        tokenCount = embeddingResult.tokenCount;
      }

      const result = await this.query<KnowledgeChunk>(
        `INSERT INTO ringaroo.knowledge_chunks 
         (knowledge_source_id, tenant_id, content, embedding, token_count, metadata)
         VALUES ($1, $2, $3, $4::vector, $5, $6)
         RETURNING *`,
        [
          sourceId,
          chunk.tenantId,
          chunk.content,
          JSON.stringify(embedding),
          tokenCount,
          JSON.stringify(chunk.metadata || {}),
        ]
      );
      
      console.log(`Successfully added knowledge chunk with embedding`);
      return result[0]!;
      
    } catch (error) {
      console.error('Failed to add knowledge chunk:', error);
      throw error;
    }
  }

  // Knowledge source management
  async createKnowledgeSource(
    tenantId: string, 
    type: 'url' | 'text', 
    source: string
  ): Promise<string> {
    const result = await this.query<{ id: string }>(
      `INSERT INTO ringaroo.knowledge_sources 
       (tenant_id, type, source, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [tenantId, type, source]
    );
    return result[0]!.id;
  }

  async updateKnowledgeSourceStatus(
    sourceId: string, 
    status: 'pending' | 'processing' | 'completed' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    await this.query(
      `UPDATE ringaroo.knowledge_sources 
       SET status = $2, last_crawled_at = NOW(), error_message = $3, updated_at = NOW()
       WHERE id = $1`,
      [sourceId, status, errorMessage || null]
    );
  }

  // Bulk operations for knowledge ingestion
  async addKnowledgeChunks(
    chunks: Array<Omit<KnowledgeChunk, 'id' | 'createdAt'>>,
    sourceId: string
  ): Promise<KnowledgeChunk[]> {
    const results: KnowledgeChunk[] = [];
    
    // Process in batches to avoid overwhelming the database
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(chunk => this.addKnowledgeChunk(chunk, sourceId))
      );
      results.push(...batchResults);
      console.log(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);
    }
    
    return results;
  }

  // Clear knowledge for a tenant (useful for updates)
  async clearTenantKnowledge(tenantId: string): Promise<void> {
    await this.query(
      'DELETE FROM ringaroo.knowledge_chunks WHERE tenant_id = $1',
      [tenantId]
    );
    console.log(`Cleared all knowledge for tenant ${tenantId}`);
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
