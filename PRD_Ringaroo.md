# Ringaroo – MVP Product Requirements Document (PRD)

## 1. Vision & Problem Statement

Australian small businesses—from clinics to electricians—lose revenue and reputation when they miss phone calls outside business hours or while staff are busy on‑site. **Ringaroo** provides a 24 × 7 AI receptionist (“Johnno”) that answers in a friendly Aussie accent, books jobs or appointments, and answers common questions by drawing on each business’s own website/FAQ. Target latency < 1 s per turn and variable cost < A\$0.05 per 3‑minute call.

---

## 2. Goals & Success Metrics

| Goal                   | Metric                                       | MVP Target                                  |
| ---------------------- | -------------------------------------------- | ------------------------------------------- |
| Reliable call handling | % calls fully handled without human transfer | ≥ 80 % across 3 pilot customers for 2 weeks |
| Fast conversation      | p95 user‑perceived response time             | ≤ 1 s                                       |
| Low variable cost      | Infra cost per 3‑min call                    | ≤ A\$0.05                                   |
| Early revenue          | Paying customers                             | ≥ 3 at ≥ A\$349 / mo                        |

---

## 3. Personas

* **Owner / Manager** – wants never‑missed calls and reduced admin.
* **Caller / Customer** – expects polite, quick, human‑like service.
* **Ringaroo Admin** – monitors calls, updates prompts, tunes models.

---

## 4. User Stories (MVP Scope)

* *As a Caller* I phone the business and speak to Johnno who can take a booking or provide answers from the business FAQ.
* *As an Owner* I receive a daily email + dashboard summarising calls, bookings and unanswered questions.
* *As an Owner* I can paste URLs or text for Johnno to learn about the business.
* *As an Admin* I can update the master system prompt and fallback message without redeploying.

---

## 5. Functional Requirements

### 5.1 Call‑Answer Flow

1. Incoming call terminates on Twilio AU local number.
2. Twilio `<Start><Stream>` sends audio via WebSocket.
3. Whisper Streaming transcribes audio to JSON partials.
4. **Orchestrator** (Fastify + TypeScript) maintains dialogue state in Redis.
5. Orchestrator retrieves relevant FAQ chunks from the tenant knowledge base (vector search) and includes them in the GPT‑4o prompt.
6. GPT‑4o returns next utterance plus optional **action** (`BOOK`, `EMAIL_OWNER`, `ESCALATE`).
7. On `BOOK`, orchestrator either:

   * Calls a **generic iCal webhook** supplied by owner, or
   * Sends a booking details email if no API is configured (MVP default).
8. On low ASR confidence (< 70 %) or timeout, transfer to voicemail and notify owner.

### 5.2 Knowledge‑Base Ingestion

* Owners can submit up to **5 URLs** or **paste up to 10 000 chars** of FAQ text.
* A background worker scrapes, cleans, chunks (≈ 300 tokens), embeds with OpenAI `text-embedding-3-small`, and stores vectors in Supabase.
* Nightly re‑crawl for URL freshness.

### 5.3 Dashboard (Owner View)

* React/Vite SPA.
* Panels: Calls, Bookings, Knowledge Sources, Error Logs.
* Toggle recording; upload/remove URLs.

### 5.4 Configuration API

* `PATCH /v1/tenant/{id}/settings` – business hours, prompt overrides, recording preference.

---

## 6. Non‑Functional Requirements

| Area              | Requirement                                                                          |
| ----------------- | ------------------------------------------------------------------------------------ |
| Latency           | < 1 s p95 per turn                                                                   |
| Availability      | 99.8 % uptime                                                                        |
| Privacy           | OAIC compliant; recordings & transcripts AES‑256 encrypted, auto‑purge after 30 days |
| Scalability       | 10 concurrent calls on one t3.medium                                                 |
| Knowledge refresh | URLs re‑indexed every 24 h                                                           |

---

## 7. Tech Stack

* **Telephony**: Twilio Programmable Voice (AU numbers)
* **ASR**: OpenAI Whisper Streaming
* **LLM**: OpenAI GPT‑4o (8k ctx)
* **TTS**: Azure Neural Speech (en‑AU voices) or ElevenLabs
* **Backend**: Node 20 + TypeScript + Fastify
* **Data**: Supabase Postgres + Vector; Redis for dialogue state
* **Knowledge Scraper**: Playwright crawler ➜ Markdown cleaner
* **Infra**: Docker, Render.com or AWS ECS Fargate
* **Observability**: Grafana Cloud + Sentry
* **CI/CD**: GitHub Actions

---

## 8. Constraints & Assumptions

* One voice persona (“Johnno”) for MVP
* Knowledge base size ≤ 50 000 tokens per tenant
* Supported language: English (AU, US, UK accents)

---

## 9. Out‑of‑Scope (v0)

* Outbound reminder or follow‑up calls
* Payment collection over IVR
* Multi‑language support

---

## 10. Milestones & Timeline (12‑Week Track)

| Week | Milestone                                      |
| ---- | ---------------------------------------------- |
| 1    | Repo scaffold, Twilio webhook returns TTS echo |
| 2    | Whisper streaming integrated, latency bench    |
| 3    | GPT‑4o orchestration loop stable               |
| 4    | Knowledge‑ingestion pipeline (URL & paste)     |
| 5    | Vector search + RAG integrated into dialogue   |
| 6    | Email booking fallback working                 |
| 7    | React dashboard MVP (calls, KB upload)         |
| 8    | Compliance (privacy text, recording toggle)    |
| 9    | Load test: 10 concurrent calls                 |
| 10   | Three free pilot businesses live               |
| 11   | Stripe billing & metering                      |
| 12   | Convert pilots to paid, Google Ads launch      |

---

## 11. Risks & Mitigations

| Risk                              | Likelihood | Impact           | Mitigation                                      |
| --------------------------------- | ---------- | ---------------- | ----------------------------------------------- |
| Long FAQ answers blow token limit | Med        | LLM errors       | Summarise embeddings > 400 tokens before insert |
| Whisper/TTS latency spikes        | Med        | Call abandonment | Filler phrases, multi‑region TTS fallback       |
| Data breach                       | Low        | High             | Encrypt at rest, restrict IPs, pen‑tests        |

**Version:** v0.2 – Updated 2025‑06‑04
