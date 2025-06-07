import { createClient, RedisClientType } from 'redis';
import { appConfig } from '@/config';
import type { DialogueState } from '@/types';

class RedisService {
  private client: RedisClientType;
  private connected = false;

  constructor() {
    this.client = createClient({
      url: appConfig.redisUrl,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 1000),
      },
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
      this.connected = true;
    });

    this.client.on('disconnect', () => {
      console.log('Redis Client Disconnected');
      this.connected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
    }
  }

  // Dialogue state management
  async setDialogueState(callSid: string, state: DialogueState): Promise<void> {
    const key = `dialogue:${callSid}`;
    const value = JSON.stringify({
      ...state,
      startedAt: state.startedAt.toISOString(),
      lastActivity: state.lastActivity.toISOString(),
      transcript: state.transcript.map(entry => ({
        ...entry,
        timestamp: entry.timestamp.toISOString(),
      })),
    });
    
    await this.client.setEx(key, appConfig.dialogueTimeoutMs / 1000, value);
  }

  async getDialogueState(callSid: string): Promise<DialogueState | null> {
    const key = `dialogue:${callSid}`;
    const value = await this.client.get(key);
    
    if (!value) return null;

    const parsed = JSON.parse(value);
    return {
      ...parsed,
      startedAt: new Date(parsed.startedAt),
      lastActivity: new Date(parsed.lastActivity),
      transcript: parsed.transcript.map((entry: any) => ({
        ...entry,
        timestamp: new Date(entry.timestamp),
      })),
    };
  }

  async deleteDialogueState(callSid: string): Promise<void> {
    const key = `dialogue:${callSid}`;
    await this.client.del(key);
  }

  async updateDialogueActivity(callSid: string): Promise<void> {
    const state = await this.getDialogueState(callSid);
    if (state) {
      state.lastActivity = new Date();
      await this.setDialogueState(callSid, state);
    }
  }

  // Audio buffer management
  async setAudioBuffer(callSid: string, buffer: string): Promise<void> {
    const key = `audio:${callSid}`;
    await this.client.setEx(key, 60, buffer); // 1 minute expiry
  }

  async getAudioBuffer(callSid: string): Promise<string | null> {
    const key = `audio:${callSid}`;
    return await this.client.get(key);
  }

  async appendAudioBuffer(callSid: string, chunk: string): Promise<void> {
    const key = `audio:${callSid}`;
    const existing = await this.client.get(key);
    const newBuffer = existing ? existing + chunk : chunk;
    await this.client.setEx(key, 60, newBuffer);
  }

  async clearAudioBuffer(callSid: string): Promise<void> {
    const key = `audio:${callSid}`;
    await this.client.del(key);
  }

  // Call rate limiting
  async incrementCallCount(tenantId: string): Promise<number> {
    const key = `calls:${tenantId}:count`;
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, 60); // Reset every minute
    }
    return count;
  }

  async getCurrentCallCount(tenantId: string): Promise<number> {
    const key = `calls:${tenantId}:count`;
    const count = await this.client.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  // Generic caching
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.setEx(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value);
    } catch {
      return value as T;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  // Get all active calls
  async getActiveCalls(): Promise<string[]> {
    const keys = await this.client.keys('dialogue:*');
    return keys.map(key => key.replace('dialogue:', ''));
  }

  // Cleanup expired dialogue states (called periodically)
  async cleanupExpiredStates(): Promise<number> {
    const keys = await this.client.keys('dialogue:*');
    let cleaned = 0;

    for (const key of keys) {
      const ttl = await this.client.ttl(key);
      if (ttl === -1 || ttl === -2) { // No expiry or expired
        await this.client.del(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

export const redis = new RedisService();
export default RedisService; 