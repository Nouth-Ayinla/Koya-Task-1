const express = require("express");
const cors = require("cors");
const { requireApiKey } = require("./middleware/auth");
const resetRouter = require("./routes/reset");
const slotsRouter = require("./routes/slots");
const bookingsRouter = require("./routes/bookings");
const config = require("./config");

const app = express();

// Full CORS setup
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-API-Key", "Idempotency-Key"],
    exposedHeaders: ["Retry-After"],
  })
);

app.use(express.json());

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
