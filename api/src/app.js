const express = require("express");
const cors = require("cors");
const { requireApiKey } = require("./middleware/auth");
const resetRouter = require("./routes/reset");
const slotsRouter = require("./routes/slots");
const bookingsRouter = require("./routes/bookings");
const config = require("./config");

const app = express();

// Full CORS & Preflight setup (Express 5 compatible)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-API-Key, Idempotency-Key");
  res.header("Access-Control-Expose-Headers", "Retry-After");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-API-Key", "Idempotency-Key"],
    exposedHeaders: ["Retry-After"],
  })
);

app.use(express.json());

// Root welcome & status endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Koya Clinic Booking API is running",
    status: "healthy",
    endpoints: {
      health: "/health",
      slots: "GET /slots (requires X-API-Key)",
      bookings: "GET, POST, DELETE /bookings (requires X-API-Key)",
      reset: "POST /reset (requires X-API-Key)",
    },
  });
});

// Public health check and config endpoints
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.get("/api/public-key", (req, res) => {
  res.status(200).json({ apiKey: config.API_KEY });
});

// Protected API routes
app.use("/reset", requireApiKey, resetRouter);
app.use("/slots", requireApiKey, slotsRouter);
app.use("/bookings", requireApiKey, bookingsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON format" });
  }

  console.error("Unhandled error:", err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Internal server error",
  });
});

module.exports = app;
