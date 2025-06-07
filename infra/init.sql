-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create custom schemas
CREATE SCHEMA IF NOT EXISTS ringaroo;

-- Grant permissions
GRANT USAGE ON SCHEMA ringaroo TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA ringaroo TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA ringaroo TO postgres;

-- Create tenants table
CREATE TABLE IF NOT EXISTS ringaroo.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20) UNIQUE,
    business_hours JSONB DEFAULT '{"mon": {"open": "09:00", "close": "17:00"}, "tue": {"open": "09:00", "close": "17:00"}, "wed": {"open": "09:00", "close": "17:00"}, "thu": {"open": "09:00", "close": "17:00"}, "fri": {"open": "09:00", "close": "17:00"}}',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create knowledge_sources table
CREATE TABLE IF NOT EXISTS ringaroo.knowledge_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES ringaroo.tenants(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('url', 'text')),
    source VARCHAR(1000) NOT NULL, -- URL or text content
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    last_crawled_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create knowledge_chunks table with vector embeddings
CREATE TABLE IF NOT EXISTS ringaroo.knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    knowledge_source_id UUID NOT NULL REFERENCES ringaroo.knowledge_sources(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES ringaroo.tenants(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(1536), -- OpenAI text-embedding-3-small dimension
    token_count INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create calls table
CREATE TABLE IF NOT EXISTS ringaroo.calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES ringaroo.tenants(id) ON DELETE CASCADE,
    twilio_call_sid VARCHAR(100) UNIQUE NOT NULL,
    caller_number VARCHAR(20),
    status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'transferred')),
    transcript JSONB DEFAULT '[]', -- Array of {speaker, text, timestamp}
    actions JSONB DEFAULT '[]', -- Array of actions taken
    duration_seconds INTEGER,
    cost_cents INTEGER,
    recording_url VARCHAR(500),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS ringaroo.bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES ringaroo.tenants(id) ON DELETE CASCADE,
    call_id UUID REFERENCES ringaroo.calls(id) ON DELETE SET NULL,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(20),
    customer_email VARCHAR(255),
    service_type VARCHAR(255),
    preferred_date DATE,
    preferred_time TIME,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    external_booking_id VARCHAR(255), -- For Cliniko or other systems
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant_id ON ringaroo.knowledge_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding ON ringaroo.knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_calls_tenant_id ON ringaroo.calls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_calls_started_at ON ringaroo.calls(started_at);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_id ON ringaroo.bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_tenant_id ON ringaroo.knowledge_sources(tenant_id);

-- Insert demo tenant for development
INSERT INTO ringaroo.tenants (id, name, phone_number, settings) 
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'Demo Clinic',
    '+61412345678',
    '{
        "cliniko_api_key": "demo_key_123",
        "cliniko_base_url": "https://api.cliniko.com/v1",
        "recording_enabled": true,
        "system_prompt_override": null
    }'
) ON CONFLICT DO NOTHING;

-- Insert demo knowledge source
INSERT INTO ringaroo.knowledge_sources (tenant_id, type, source, status, last_crawled_at)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'text',
    'Our clinic offers general consultations, physiotherapy, and mental health services. We are open Monday to Friday 9 AM to 5 PM. Appointments can be booked online or by phone. We accept Medicare and most private health insurance. Our clinic is located at 123 Collins Street, Melbourne.',
    'completed',
    NOW()
) ON CONFLICT DO NOTHING;

-- Create update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON ringaroo.tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_knowledge_sources_updated_at BEFORE UPDATE ON ringaroo.knowledge_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON ringaroo.bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 