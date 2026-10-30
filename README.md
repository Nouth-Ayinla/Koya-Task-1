# Koya Clinic — Appointment Booking System

A full-stack clinic appointment booking system featuring a high-performance REST API and a responsive patient web portal.

Built with Node.js, Express, and Neon Serverless PostgreSQL.

---

## 🏗 Architecture & Features

### Core API Capabilities
* **Slot Management & Scheduling**: Query available clinic slots with provider filtering, real-time availability tracking, and atomic reservations.
* **Security & Authentication**: Enforces X-API-Key authentication across all protected endpoints.
* **Strict Validation**: Validates appointment inputs, past time rejection, RFC-compliant email verification, and string sanitization.
* **Concurrency Safety**: Database-level locks (SELECT ... FOR UPDATE) and partial unique indexes (idx_confirmed_slot) physically prevent double-booking even under concurrent traffic spikes.
* **Idempotency Engine**: Supports Idempotency-Key headers to ensure network retries never create duplicate appointments, with automatic body discrepancy detection (422 Unprocessable Entity).
* **Cursor-Based Pagination**: Efficient, scalable pagination for retrieving patient appointment histories without offset degradation.
* **Rate Limiting**: Sliding-window rate limiter restricting booking attempts to 5 requests per minute per email with standard Retry-After headers.

### Patient Web Portal
* Multi-step booking workflow (Service -> Time -> Details -> Done).
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

---

## 💻 Local Development

### 1. Backend API

1. Navigate to the API directory:
   ```bash
   cd api
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your `.env` file with your database connection and secret key:
   ```env
   PORT=3000
   API_KEY=koya_clinic_secret_key_2026
   DATABASE_URL=postgresql://...
   ```

4. Run the automated test suite (verifies Level 1 through Level 5):
   ```bash
   npm test
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```
   *(Or `npm start`)*

---

### 2. Frontend Web Portal

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```
   *(Builds configuration and serves the portal at `http://localhost:5000`)*

---

## 🔌 API Reference

All protected requests require the X-API-Key header.

### 1. Reset / Seed Slots
```http
POST /reset
Content-Type: application/json
X-API-Key: <API_KEY>

{
  "slots": [
    {
      "id": "s1",
      "provider": "Dr Ade",
      "start": "2028-12-10T09:00:00Z",
      "end": "2028-12-10T09:30:00Z"
    }
  ]
}
```

### 2. List Available Slots
```http
GET /slots?provider=Dr%20Ade
X-API-Key: <API_KEY>
```

### 3. Book an Appointment Slot
```http
POST /bookings
Content-Type: application/json
X-API-Key: <API_KEY>
Idempotency-Key: <optional-unique-key>

{
  "slot_id": "s1",
  "name": "Ada Obi",
  "email": "ada@example.com"
}
```

### 4. Retrieve Booking by ID
```http
GET /bookings/{id}
X-API-Key: <API_KEY>
```

### 5. Cancel Booking
```http
DELETE /bookings/{id}
X-API-Key: <API_KEY>
```

### 6. List Patient Bookings (Cursor Paginated)
```http
GET /bookings?email=ada@example.com&limit=10&cursor=<next_cursor>
X-API-Key: <API_KEY>
```
