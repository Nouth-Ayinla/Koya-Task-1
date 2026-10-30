const { getDb } = require("../db");

async function checkBookingRateLimit(req, res, next) {
  const rawEmail = req.body && typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : null;

  if (!rawEmail) {
    return next();
  }

  try {
    const db = await getDb();
    const now = Date.now();
    const windowStart = now - 60 * 1000;

    const recentAttempts = await db.getRecentRateLimitAttempts(rawEmail, windowStart);

    if (recentAttempts.length >= 5) {
      const oldestInWindow = recentAttempts[0];
      const waitMs = oldestInWindow + 60 * 1000 - now;
      const retryAfterSeconds = Math.max(1, Math.ceil(waitMs / 1000));

      await db.recordRateLimitAttempt(rawEmail, now);

      res.setHeader("Retry-After", retryAfterSeconds.toString());
      return res.status(429).json({
        error: "Too many attempts for this email",
      });
    }

    await db.recordRateLimitAttempt(rawEmail, now);
    next();
  } catch (err) {
    console.error("Rate limiter error:", err);
    next();
  }
}

module.exports = { checkBookingRateLimit };
