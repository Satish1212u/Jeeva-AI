# Jeeva AI 🩺 — Production-Ready Telegram AI Medical Assistant

Jeeva AI is a production-grade Telegram AI medical information and clinical decision-support assistant built with Node.js, TypeScript, Express, Prisma ORM (PostgreSQL), and multi-provider AI.

Jeeva AI helps users understand symptoms, demystify complex lab reports, transcribe and verify prescriptions, look up verified medicine intelligence, manage family health records, and compile structured doctor-ready briefings.

> ⚠️ **CRITICAL MEDICAL DISCLAIMER**: Jeeva AI is strictly an educational decision-support assistant and **NOT** a certified medical doctor. It does not provide definitive diagnoses, alter medication dosages, or recommend stopping prescribed treatments. Always consult a qualified physician for clinical care, or dial **112** (India) / **911** (US) for emergencies.

---

## 📑 Table of Contents

1. [Key Features](#-key-features)
2. [Architecture Overview](#-architecture-overview)
3. [Technology Stack](#-technology-stack)
4. [Project Structure](#-project-structure)
5. [Prerequisites](#-prerequisites)
6. [Local Setup & Development](#-local-setup--development)
7. [Environment Variables](#-environment-variables)
8. [Database Setup & Migrations](#-database-setup--migrations)
9. [Setting Up Your Telegram Bot (BotFather)](#-setting-up-your-telegram-bot-botfather)
10. [Configuring Telegram Webhook](#-configuring-telegram-webhook)
11. [Deployment Guide](#-deployment-guide)
    - [Deploy to Render](#deploy-to-render)
    - [Deploy to Vercel](#deploy-to-vercel)
12. [Testing & Quality Assurance](#-testing--quality-assurance)
13. [Current Feature Status & Roadmap](#-current-feature-status--roadmap)

---

## 🌟 Key Features

* **Multi-Provider AI Layer**:
  - **Gemini 2.5 Flash-Lite** (`gemini-2.5-flash-lite`): Fast provider for greetings, basic conversation, language detection, and lightweight routing.
  - **Gemini 2.5 Flash** (`gemini-2.5-flash`): Primary clinical model for medical dialogue, symptoms, lab reports, prescriptions, and multimodal image comprehension.
  - **Grok** (`grok-4.6`): Secondary fallback model triggered when Gemini encounters rate-limits, transient outages, or errors.
  - **OpenRouter** (`openrouter/free`): Final tertiary fallback ensuring resilience.
* **Deterministic SafetyEngine & ResponseGuard**: Dedicated safety pipeline intercepting red flags prior to LLM routing, and post-filtering AI provider output to suppress doctor impersonation, soften definitive diagnoses, block dose alterations, and ensure medical disclaimers.
* **Lab Report Analysis**: Structured parameter extractor for blood tests (CBC, KFT, LFT, Lipid, Fasting Glucose, HbA1c, TSH) with reference intervals, abnormal flags, and layman explanations without premature diagnosis.
* **Prescription Reader**: Reads typed and handwritten prescriptions, extracts medicine name, strength, frequency, and duration. Flags unclear or ambiguous handwriting with `[UNCLEAR]` tags and instructs verification with a pharmacist.
* **Medicine Intelligence**: Pluggable drug directory with composition, manufacturer, indications, precautions, interactions, and verified product imagery (never AI-hallucinated packaging).
* **Report Comparison**: Compares prior and newer lab reports to track parameter trends (normalized, newly abnormal, unchanged) without automatic diagnosis.
* **Doctor-Ready Summaries (`/summary`)**: Generates a structured clinical visit briefing with patient demographics, primary concerns, timeline, current medications, and discussion questions for consultations.
* **Family Health Profiles**: Manage isolated records for Self, Father, Mother, Spouse, Child, Sibling, and Other with rapid inline switching.
* **Privacy & Erasure (`/reset`)**: Complete user data wiping adhering to GDPR and privacy best practices.
* **Provider Health Tracking**: Live monitoring at `GET /health/providers` tracking latency, consecutive failures, and degradation states (`HEALTHY`, `DEGRADED`, `UNAVAILABLE`).

---

## 🏛️ Architecture Overview

```
                          ┌───────────────────────────┐
                          │   Telegram Messenger      │
                          └─────────────┬─────────────┘
                                        │ HTTPS Webhook
                                        ▼
                          ┌───────────────────────────┐
                          │  Express Webhook Gateway  │
                          │   (Secret Token Auth &    │
                          │      Rate Limiter)        │
                          └─────────────┬─────────────┘
                                        │
                 ┌──────────────────────┼──────────────────────┐
                 │                      │                      │
                 ▼                      ▼                      ▼
       ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
       │  CommandHandler   │  │  MessageHandler   │  │  DocumentHandler  │
       │ (/start, /help,   │  │ (Text, Symptoms,  │  │ (PDFs, JPG, PNG,  │
       │  /profile, etc.)  │  │  Medicine Lookup) │  │  Labs & Rx Parser)│
       └─────────┬─────────┘  └─────────┬─────────┘  └─────────┬─────────┘
                 │                      │                      │
                 │            ┌─────────┴─────────┐            │
                 │            │   SafetyEngine    │            │
                 │            │  (Red-Flag Guard) │            │
                 │            └─────────┬─────────┘            │
                 │                      │                      │
                 ▼                      ▼                      ▼
       ┌─────────────────────────────────────────────────────────────┐
       │                       Core Services                         │
       │  • UserService          • ReportParser     • StorageService │
       │  • ConversationService  • RxParser         • OpenAI Service │
       │  • MedicineService      • CompareService   • DoctorSummary  │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
       ┌───────────────────┐                     ┌───────────────────┐
       │  PostgreSQL (DB)  │                     │ Local / S3 Cloud  │
       │   (Prisma ORM)    │                     │   File Storage    │
       └───────────────────┘                     └───────────────────┘
```

---

## 💻 Technology Stack

* **Runtime**: Node.js (v20+) & TypeScript
* **Framework**: Express 4.x
* **Database & ORM**: PostgreSQL & Prisma ORM
* **AI Model**: OpenAI Responses / Chat Completions API (`gpt-4o-mini`)
* **Validation**: Zod
* **Testing**: Vitest & Supertest
* **Logging**: Pino structured logger with sensitive token masking
* **Linting**: ESLint 9 (Flat Config)

---

## 📁 Project Structure

```
medlens.ai/
├── src/
│   ├── ai/
│   │   ├── openai.ts                 # OpenAI client & fallback response mode
│   │   ├── router.ts                 # Intent classifier & triage router
│   │   ├── safetyEngine.ts           # Dedicated red-flag detector & output sanitizer
│   │   └── prompts/
│   │       └── systemPrompts.ts      # Multilingual system instructions
│   ├── bot/
│   │   ├── telegramBot.ts            # Telegram Bot API client
│   │   ├── handlers/
│   │   │   ├── commandHandler.ts     # /start, /help, /privacy, /profile, /summary, /reset
│   │   │   ├── messageHandler.ts     # Natural language chat & medicine lookup
│   │   │   ├── callbackHandler.ts    # Inline button interaction router
│   │   │   └── documentHandler.ts    # Safe file download, validation, OCR/parser
│   │   └── keyboards/
│   │       └── inlineKeyboards.ts    # Telegram interactive keyboard markup
│   ├── config/
│   │   └── env.ts                    # Zod environment variable validation
│   ├── database/
│   │   └── prisma.ts                 # Prisma singleton with BigInt serialization
│   ├── medical/
│   │   ├── comparisons/
│   │   │   └── reportComparisonService.ts # Old vs new report delta analyzer
│   │   ├── imaging/                  # Future imaging stubs
│   │   │   ├── ctService.ts
│   │   │   ├── ecgService.ts
│   │   │   ├── mriService.ts
│   │   │   ├── ultrasoundService.ts
│   │   │   └── xrayService.ts
│   │   ├── medicines/
│   │   │   ├── medicineDatabase.ts   # Extensible drug database & interface
│   │   │   └── medicineService.ts    # Formatted medicine intelligence & photo lookup
│   │   ├── prescriptions/
│   │   │   └── prescriptionParser.ts # Handwritten/typed Rx parser with [UNCLEAR] tags
│   │   ├── reports/
│   │   │   └── reportParser.ts       # Lab report parameters & layperson explanation
│   │   └── summaries/
│   │       └── doctorSummaryService.ts # Doctor-ready clinical visit briefing
│   ├── storage/
│   │   └── storageService.ts         # Local / S3 storage abstraction & MIME checks
│   ├── users/
│   │   └── userService.ts            # User profiles, family switching, consent, reset
│   ├── conversations/
│   │   └── conversationService.ts    # Bounded conversation history management
│   ├── utils/
│   │   ├── language.ts               # Language detection (English, Hindi, Hinglish)
│   │   └── logger.ts                 # Structured logger with data redaction
│   ├── app.ts                        # Express app with rate-limiting & endpoints
│   └── server.ts                     # HTTP server entrypoint
├── prisma/
│   └── schema.prisma                 # Relational database schema
├── api/
│   └── index.ts                      # Vercel serverless entrypoint
├── tests/                            # Comprehensive Vitest test suite
├── render.yaml                       # Render deployment specification
├── vercel.json                       # Vercel serverless routing config
├── .env.example
├── package.json
└── tsconfig.json
```

---

## ⚙️ Prerequisites

* Node.js v20.x or higher
* npm v10.x or higher
* PostgreSQL instance (local or hosted, e.g. Supabase, Neon, Render)

---

## 🚀 Local Setup & Development

1. **Clone or Navigate to the Workspace**:
   ```bash
   cd c:\Users\ASUS\Desktop\medlens.ai
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and fill in your keys (see [Environment Variables](#-environment-variables)).

4. **Generate Prisma Client & Run Migrations**:
   ```bash
   npm run prisma:generate
   # If you have a local PostgreSQL running:
   npm run prisma:migrate
   ```

5. **Start Development Server**:
   ```bash
   npm run dev
   ```
   The server will start at `http://localhost:3000`.

---

## 🔑 Environment Variables

| Variable | Description | Default / Example |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot token provided by @BotFather | `123456789:ABCdef...` |
| `TELEGRAM_WEBHOOK_SECRET` | Secret string for verifying webhook payload origin | `my_secret_token_123` |
| `OPENAI_API_KEY` | OpenAI API Key (optional for mock dev mode) | `sk-...` |
| `OPENAI_MODEL` | OpenAI Chat model | `gpt-4o-mini` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/medai` |
| `STORAGE_TYPE` | Storage engine (`local` or `s3`) | `local` |
| `LOCAL_STORAGE_DIR` | Directory for local file storage | `./uploads` |
| `APP_URL` | Public HTTPS domain of the app | `https://medai.onrender.com` |
| `PORT` | HTTP port | `3000` |
| `NODE_ENV` | Runtime environment | `development` / `production` |

---

## 🗄️ Database Setup & Migrations

Jeeva AI utilizes Prisma ORM with PostgreSQL. The schema includes:
* `User`: Telegram ID (unique indexed), display name, preferred language, active family profile.
* `FamilyProfile`: Family member profiles (`SELF`, `FATHER`, `MOTHER`, `SPOUSE`, `CHILD`, `SIBLING`, `OTHER`) with allergies and pre-existing conditions.
* `Conversation`: Chat sessions bound to users and family members.
* `Message`: Roles, text, and metadata with sliding window retrieval.
* `MedicalDocument`: Metadata for uploaded PDFs/images, storage location, and processing status.
* `LabResult`: Test name, value, unit, reference range, and flag (`NORMAL`, `HIGH`, `LOW`, `ABNORMAL`, `CRITICAL`).
* `Medication`: Active and discontinued medications with dosage and frequency.
* `HealthEvent`: Timeline events (diagnoses, surgeries, immunizations).
* `Consent`: Audit logs of disclaimer acceptance.

To run migrations:
```bash
npx prisma migrate dev --name init
```

---

## 🤖 Setting Up Your Telegram Bot (BotFather)

1. Open Telegram and search for `@BotFather`.
2. Start chat and type `/newbot`.
3. Choose a display name (e.g. `Jeeva AI Assistant`) and a unique username (e.g. `jeeva_health_bot`).
4. Copy the generated **HTTP API Token** and set it as `TELEGRAM_BOT_TOKEN` in your `.env`.
5. Set bot commands by sending `/setcommands` to `@BotFather`:
   ```
   start - Welcome and main menu
   help - How to use Jeeva AI
   profile - Manage personal and family health profiles
   summary - Generate doctor-ready consultation briefing
   compare - Compare older and newer lab reports
   privacy - Review data protection policy
   reset - Wipe all personal data and conversation history
   ```

---

## 🌐 Configuring Telegram Webhook

Once your app is deployed to a public HTTPS domain (or via an `ngrok` tunnel for local testing):

### Automatic Registration (via Curl):
```bash
curl -F "url=https://YOUR_DOMAIN.com/webhook/telegram" \
     -F "secret_token=YOUR_TELEGRAM_WEBHOOK_SECRET" \
     https://api.telegram.org/botYOUR_TELEGRAM_BOT_TOKEN/setWebhook
```

### Verification:
Verify the webhook status at any time:
```bash
curl https://api.telegram.org/botYOUR_TELEGRAM_BOT_TOKEN/getWebhookInfo
```

---

## ☁️ Deployment Guide

### Deploy to Render

Jeeva AI includes a ready-to-use `render.yaml` blueprint:

1. Push your repository to GitHub or GitLab.
2. In Render Dashboard, click **New +** → **Blueprint**.
3. Connect your repository. Render will automatically detect `render.yaml` and configure:
   - A Node.js Web Service running `npm run start`.
   - A managed PostgreSQL database.
   - Built-in health check on `/health`.
4. In the Environment settings, configure:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `OPENAI_API_KEY`
5. Once deployed, register the webhook pointing to `https://<YOUR_RENDER_SERVICE>.onrender.com/webhook/telegram`.

### Deploy to Vercel

Jeeva AI includes native serverless support via `api/index.ts` and `vercel.json`:

1. Install Vercel CLI or link through the Vercel Web Dashboard:
   ```bash
   npx vercel
   ```
2. In the Vercel project settings, set environment variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `OPENAI_API_KEY`
   - `DATABASE_URL` (Serverless PostgreSQL such as Neon, Supabase, or AWS RDS)
3. Deploy to production:
   ```bash
   npx vercel --prod
   ```
4. Set the Telegram webhook to `https://<YOUR_VERCEL_PROJECT>.vercel.app/webhook/telegram`.

---

## 🧪 Testing & Quality Assurance

Run the comprehensive test suite with Vitest:

```bash
# Run all unit and integration tests
npm test

# Run tests in watch mode
npm run test:watch

# Run TypeScript typecheck without emitting
npm run typecheck

# Run ESLint
npm run lint

# Build production bundle to ./dist
npm run build
```

### Test Coverage Highlights:
* `GET /health` status verification
* Telegram webhook secret rejection (401 Unauthorized)
* Slash commands `/start`, `/help`, `/privacy`, `/profile`, `/reset`, `/summary`, `/compare`
* Immediate red-flag detection (cardiac, stroke, respiratory, suicide crisis) in English, Hindi, and Hinglish
* Post-LLM safety guardrails (doctor impersonation suppression, diagnostic softening, dose lock)
* Multi-language detection (English, Hindi, Hinglish)
* Medicine intelligence lookups with precautions, interactions, and verified photo references
* Lab report parameter parsing (CBC, KFT, LFT, Lipid, Fasting Glucose, HbA1c, TSH)
* Handwritten prescription uncertainty flagging (`[UNCLEAR]`)
* Report comparison deltas (improved, newly abnormal, unchanged)
* Doctor-ready clinical briefing synthesis
* Storage type and 15MB file size limit validation

---

## 🧭 Current Feature Status & Roadmap

| Feature Area | Status | Notes |
|---|---|---|
| Telegram Webhook & Commands | ✅ Production Ready | Handles text, photos, documents, callbacks, secret validation |
| Dedicated SafetyEngine | ✅ Production Ready | Rule-based triage + response sanitizer |
| Multilingual (EN/HI/Hinglish) | ✅ Production Ready | Natural Hindi and Hinglish conversational support |
| Persistent Health & Family Profiles | ✅ Production Ready | Prisma relational models with fallback resilience |
| Lab Report Extraction | ✅ Production Ready | 9+ standard test panels with non-diagnostic layman explanations |
| Handwritten Prescription Reader | ✅ Production Ready | Extracts regimens; flags illegible segments with explicit warnings |
| Medicine Intelligence | ✅ Production Ready | Pluggable drug catalog with verified image references |
| Report Trend Comparison | ✅ Production Ready | Old vs new comparison with clinical delta tracking |
| Doctor Consultation Briefing (`/summary`) | ✅ Production Ready | Comprehensive structured clinical visit briefing |
| Multi-Cloud Deploy (Render & Vercel) | ✅ Production Ready | Unified codebase with serverless adapter |
| Medical Imaging (X-ray, ECG, MRI, CT, Ultrasound)| 🚧 Future Architecture | Clean typed interfaces & stubs; awaits clinically validated specialized models |
