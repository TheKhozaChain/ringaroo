export interface DialogueState {
  callSid: string;
  tenantId: string;
  callerNumber?: string;
  transcript: TranscriptEntry[];
  context: ConversationContext;
  currentAction?: PendingAction;
  status: CallStatus;
  startedAt: Date;
  lastActivity: Date;
}

export interface TranscriptEntry {
  speaker: 'caller' | 'johnno';
  text: string;
  timestamp: Date;
  confidence?: number;
}

export interface ConversationContext {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  intent?: 'booking' | 'inquiry' | 'complaint' | 'other';
  bookingDetails?: BookingDetails;
  knowledgeUsed: string[];
  transferReason?: string;
}

export interface BookingDetails {
  serviceType?: string;
  preferredDate?: string;
  preferredTime?: string;
  notes?: string;
  urgency?: 'low' | 'medium' | 'high';
}

export interface PendingAction {
  type: ActionType;
  parameters: Record<string, unknown>;
  timestamp: Date;
  retryCount: number;
}

export type ActionType = 'BOOK' | 'EMAIL_OWNER' | 'ESCALATE' | 'CONTINUE';

export type CallStatus = 'in_progress' | 'completed' | 'failed' | 'transferred';

export interface Tenant {
  id: string;
  name: string;
  phoneNumber?: string;
  businessHours: BusinessHours;
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessHours {
  [key: string]: { open: string; close: string } | null;
}

export interface TenantSettings {
  clinikoApiKey?: string;
  clinikoBaseUrl?: string;
  recordingEnabled: boolean;
  systemPromptOverride?: string;
  webhookUrl?: string;
  escalationEmail?: string;
}

export interface KnowledgeChunk {
  id: string;
  tenantId: string;
  content: string;
  embedding?: number[];
  tokenCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface Call {
  id: string;
  tenantId: string;
  twilioCallSid: string;
  callerNumber?: string;
  status: CallStatus;
  transcript: TranscriptEntry[];
  actions: ActionRecord[];
  durationSeconds?: number;
  costCents?: number;
  recordingUrl?: string;
  startedAt: Date;
  endedAt?: Date;
}

export interface ActionRecord {
  type: ActionType;
  parameters: Record<string, unknown>;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
}

export interface Technician {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  specialties: string[];
  availability: Record<string, { start: string; end: string }>;
  maxDailyBookings: number;
  isActive: boolean;
  emergencyContact: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Booking {
  id: string;
  tenantId: string;
  callId?: string;
  technicianId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  serviceType?: string;
  preferredDate?: Date;
  preferredTime?: string;
  estimatedDuration: number; // Duration in minutes
  priorityLevel: 'low' | 'normal' | 'high' | 'emergency';
  notes?: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  externalBookingId?: string;
  assignedAt?: Date;
  confirmedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Twilio WebSocket Message Types
export interface TwilioStreamMessage {
  event: 'connected' | 'start' | 'media' | 'stop';
  sequenceNumber?: string;
  media?: {
    track: string;
    chunk: string;
    timestamp: string;
    payload: string;
  };
  start?: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    mediaFormat: {
      encoding: string;
      sampleRate: number;
      channels: number;
    };
  };
  stop?: {
    accountSid: string;
    callSid: string;
  };
}

// OpenAI Response Types
export interface GPTResponse {
  message: string;
  action?: ActionType;
  actionParameters?: Record<string, unknown>;
  confidence: number;
}

// Cliniko API Types
export interface ClinikoAppointment {
  id?: string;
  appointment_start: string;
  appointment_end: string;
  patient_id?: string;
  practitioner_id?: string;
  appointment_type_id?: string;
  business_id?: string;
  notes?: string;
}

export interface ClinikoPatient {
  id?: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  email?: string;
}

// Audio Processing Types
export interface AudioBuffer {
  data: Buffer;
  timestamp: Date;
  sequenceNumber: number;
}

export interface WhisperTranscription {
  text: string;
  confidence: number;
  isPartial: boolean;
  timestamp: Date;
}

// Environment Configuration
export interface AppConfig {
  nodeEnv: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  redisUrl: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  openaiApiKey: string;
  openaiModel: string;
  openaiEmbeddingModel: string;
  azureSpeechKey?: string;
  azureSpeechRegion?: string;
  elevenlabsApiKey?: string;
  elevenlabsVoiceId?: string;
  jwtSecret: string;
  webhookBaseUrl: string;
  maxConcurrentCalls: number;
  dialogueTimeoutMs: number;
  asrConfidenceThreshold: number;
} 