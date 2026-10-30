# Varma Clinic — Appointment Booking System

A full-stack clinic appointment booking system featuring a high-performance REST API and a responsive patient web portal.

Built with Node.js, Express, and Neon Serverless PostgreSQL.

---

## 🏗 Architecture & Features

### Core API Capabilities
* **Slot Management & Scheduling**: Query available clinic slots with provider filtering, real-time availability tracking, and atomic reservations.
* **Security & Authentication**: Enforces `X-API-Key` authentication across all protected endpoints.
* **Strict Validation**: Validates appointment inputs, past time rejection, RFC-compliant email verification, and string sanitization.
* **Concurrency Safety**: Database-level locks (`SELECT ... FOR UPDATE`) and partial unique indexes (`idx_confirmed_slot`) physically prevent double-booking even under concurrent traffic spikes.
* **Idempotency Engine**: Supports `Idempotency-Key` headers to ensure network retries never create duplicate appointments, with automatic body discrepancy detection (`422 Unprocessable Entity`).
* **Cursor-Based Pagination**: Efficient, scalable pagination for retrieving patient appointment histories without offset degradation.
* **Rate Limiting**: Sliding-window rate limiter restricting booking attempts to 5 requests per minute per email with standard `Retry-After` headers.

### Patient Web Portal
* Multi-step booking workflow (**Service** -> **Time** -> **Details** -> **Done**).
* Real-time slot availability feedback with automated validation cues.
* Patient appointment lookup drawer with on-demand booking cancellation.

---

## 📁 Repository Structure

```
├── api/
│   ├── src/
│   │   ├── app.js               # Express application configuration & CORS
│   │   ├── config.js            # Environment settings
│   │   ├── db/                  # PostgreSQL database client & schema migrations
│   │   ├── middleware/          # API Key authentication & sliding-window rate limiter
│   │   └── routes/              # Route handlers (/slots, /bookings, /reset)
│   ├── test/
│   │   └── api.test.js          # Comprehensive test suite (Level 1 to Level 5)
│   ├── server.js                # Server entry point
│   ├── package.json
│   └── vercel.json
│
└── frontend/
    ├── index.html               # Semantic patient portal markup
    ├── style.css                # Clinic UI design system
    ├── app.js                   # Client-side state & API communication
    ├── build.js                 # Environment-aware configuration builder
    └── vercel.json
```

-
