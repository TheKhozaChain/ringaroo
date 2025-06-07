# Ringaroo 🇦🇺 - AI Receptionist for Australian Small Businesses

> **"No worries mate, Johnno's got this!"** - Your 24/7 AI receptionist with a friendly Aussie accent.

Ringaroo provides an AI-powered phone receptionist that answers calls, books appointments, and handles customer inquiries for Australian small businesses—from clinics to tradies. Built with Node.js, TypeScript, and the latest AI technologies.

## 🎯 Features

- **24/7 AI Receptionist ("Johnno")** - Friendly Australian AI that never misses a call
- **Seamless Booking Integration** - Direct integration with Cliniko and other practice management systems
- **Real-time Call Processing** - Sub-1-second response times using OpenAI Whisper + GPT-4o
- **Knowledge Base Integration** - Answers questions using your business's own website/FAQ content
- **Smart Call Routing** - Escalates complex issues to human staff when needed
- **Comprehensive Dashboard** - Monitor calls, bookings, and performance metrics

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Twilio AU     │───▶│   Ringaroo API   │───▶│   OpenAI GPT    │
│   Phone Number │    │   (Fastify/TS)   │    │   + Whisper     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────────┐
                       │   Business Logic    │
                       │   • Call State      │
                       │   • Booking Logic   │
                       │   • Knowledge RAG   │
                       └─────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │   Redis     │ │ PostgreSQL  │ │   Cliniko   │
        │ (Dialogue)  │ │ (Data +     │ │   API       │
        │             │ │  Vectors)   │ │             │
        └─────────────┘ └─────────────┘ └─────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+** and npm
- **Docker** and docker-compose
- **ngrok** (for local Twilio webhook testing)
- **Twilio Account** with Australian phone number
- **OpenAI API Key** with GPT-4o access

### 1. Clone and Setup

```bash
git clone <repository-url>
cd ringaroo
cp env.example .env
```

### 2. Configure Environment

Edit `.env` with your credentials:

```bash
# Required: Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+61491570006

# Required: OpenAI Configuration  
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Required: Webhook URL (use ngrok for local dev)
WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io

# Optional: Cliniko Integration
CLINIKO_API_KEY=your_cliniko_api_key_here
CLINIKO_BASE_URL=https://api.cliniko.com/v1
```

### 3. Install Dependencies

```bash
npm run install  # Installs deps for all workspaces
```

### 4. Start Development Environment

```bash
make dev
```

This command will:
- Start PostgreSQL + Redis via Docker
- Launch the API server on http://localhost:3000
- Start the React dashboard on http://localhost:5173
- Initialize the database with demo data

### 5. Expose Local Server (for Twilio)

In a separate terminal:

```bash
npx ngrok http 3000
```

Copy the HTTPS URL to your `.env` file as `WEBHOOK_BASE_URL`.

### 6. Test with Demo Call

```bash
npm run call-demo
```

This will place a test call using your Twilio number and demonstrate the booking flow.

## 📱 Usage Examples

### Incoming Call Flow

1. **Customer calls** your Twilio AU number
2. **Johnno greets** them: *"G'day! Thanks for calling. I'm Johnno, your AI assistant. How can I help you today?"*
3. **Customer says**: *"I'd like to book a physio appointment"*
4. **Johnno responds**: *"No worries! I can help you book that. What's your name, mate?"*
5. **Booking process** continues until all details are captured
6. **Appointment created** in Cliniko or via email fallback

### Dashboard Monitoring

- **Real-time call logs** with full transcripts
- **Booking management** - view, confirm, or cancel appointments  
- **Knowledge base** - upload FAQs and business information
- **Performance metrics** - response times, success rates, cost per call

## 🛠️ Development

### Project Structure

```
ringaroo/
├── server/                 # Fastify API server
│   ├── src/
│   │   ├── routes/         # Twilio webhooks, booking actions
│   │   ├── services/       # Database, Redis, Orchestrator
│   │   ├── types/          # TypeScript definitions
│   │   └── __tests__/      # Jest unit tests
│   └── package.json
├── web/                    # React dashboard
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Route pages
│   │   └── hooks/          # Custom React hooks
│   └── package.json
├── infra/                  # Infrastructure config
│   ├── init.sql            # Database schema
│   ├── kong.yml            # Supabase API gateway
│   └── docker-compose.yml  # Local dev services
└── Makefile               # Development commands
```

### Key Commands

```bash
# Development
make dev                    # Start full dev environment
make down                   # Stop all services
make clean                  # Clean & reset everything

# Testing  
npm test                    # Run all tests
npm run test:coverage       # Test with coverage
npm run call-demo          # Demo call flow

# Database
make migrate               # Run migrations
make seed                  # Seed demo data
```

### Running Tests

```bash
# All tests
npm test

# Specific service tests
cd server && npm test

# With coverage
npm run test:coverage
```

## 🔧 Configuration

### Core Settings

| Variable | Description | Required |
|----------|-------------|----------|
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID | ✅ |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token | ✅ |
| `TWILIO_PHONE_NUMBER` | Your AU phone number | ✅ |
| `OPENAI_API_KEY` | OpenAI API key with GPT-4o access | ✅ |
| `WEBHOOK_BASE_URL` | Public URL for Twilio webhooks | ✅ |

### Optional Integrations

| Variable | Description | Default |
|----------|-------------|---------|
| `CLINIKO_API_KEY` | Cliniko practice management integration | Email fallback |
| `ELEVENLABS_API_KEY` | ElevenLabs for advanced TTS | Azure Speech |
| `AZURE_SPEECH_KEY` | Azure Speech Services | Built-in TTS |

### Performance Tuning

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_CONCURRENT_CALLS` | Max simultaneous calls | 10 |
| `DIALOGUE_TIMEOUT_MS` | Call timeout | 30000 |
| `ASR_CONFIDENCE_THRESHOLD` | Speech recognition threshold | 0.7 |

## 📊 Latency Benchmarking

To measure response times as per the PRD requirement (< 1s p95):

```bash
# Start the server
make dev

# In another terminal, run latency tests
cd server
npm run benchmark

# Results will show:
# - Average response time
# - p95 response time  
# - Success rate
# - Cost per call estimate
```

Target metrics:
- **p95 Response Time**: < 1 second
- **Success Rate**: ≥ 80% calls handled without transfer
- **Cost per 3-min call**: ≤ A$0.05

## 🧪 Testing Strategy

### Unit Tests
- **Orchestrator logic** - dialogue management, GPT integration
- **Twilio webhooks** - call handling, TwiML generation
- **Database operations** - CRUD operations, migrations

### Integration Tests  
- **End-to-end call flow** - Twilio → Whisper → GPT → TTS
- **Cliniko booking** - patient creation, appointment scheduling
- **Knowledge base** - vector search, RAG responses

### Load Testing
```bash
# Test concurrent call handling
npm run load-test

# Simulate 10 concurrent calls for 5 minutes
npm run stress-test
```

## 🌐 Deployment

### Local Development
```bash
make dev  # Uses Docker Compose
```

### Production (Render.com)
```bash
# Configure environment variables in Render dashboard
# Deploy directly from GitHub repository
# Ensure database and Redis are configured
```

### AWS ECS (Alternative)
```bash
# Build Docker images
docker build -t ringaroo-server ./server
docker build -t ringaroo-web ./web

# Deploy using provided CloudFormation templates
```

## 🔐 Security & Compliance

- **OAIC Compliant** - Australian privacy laws
- **AES-256 Encryption** - All recordings and transcripts
- **Auto-purge** - Data deleted after 30 days
- **IP Restrictions** - Webhook endpoints secured
- **JWT Authentication** - Dashboard access control

## 📈 Monitoring & Observability

### Logging
- **Structured logging** with Pino
- **Call transcripts** with confidence scores
- **Error tracking** with stack traces
- **Performance metrics** (latency, success rates)

### Metrics Dashboard
- **Call volume** by hour/day/week
- **Booking conversion rates**
- **Average handle time**
- **Cost per call tracking**

### Alerts
- **High error rates** > 5%
- **Slow response times** > 2s p95
- **Service downtime**
- **Failed booking attempts**

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make changes and add tests
4. Run test suite: `npm test`
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open Pull Request

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [docs.ringaroo.ai](https://docs.ringaroo.ai)
- **Discord Community**: [discord.gg/ringaroo](https://discord.gg/ringaroo)
- **Email Support**: support@ringaroo.ai
- **GitHub Issues**: For bugs and feature requests

---

**Built with ❤️ in Australia** 🇦🇺

*No worries mate, Johnno's got your calls covered!* 