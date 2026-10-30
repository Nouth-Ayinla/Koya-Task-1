const express = require("express");
const crypto = require("crypto");
const { getDb } = require("../db");
const { checkBookingRateLimit } = require("../middleware/rateLimiter");

const router = express.Router();

function getBodyHash(body) {
  if (!body || typeof body !== "object") return "";
  const keys = Object.keys(body).sort();
  const obj = {};
  for (const k of keys) {
    obj[k] = body[k];
  }
  return JSON.stringify(obj);
}

// POST /bookings (Levels 1-5)
router.post("/", checkBookingRateLimit, async (req, res, next) => {
  try {
    const db = await getDb();
    const idempKey = req.header("Idempotency-Key");

    // Level 4: Check Idempotency-Key
    if (idempKey) {
      const existingRecord = await db.getIdempotencyRecord(idempKey);
      if (existingRecord) {
        const currentHash = getBodyHash(req.body);
        if (existingRecord.request_hash !== currentHash) {
          return res.status(422).json({
            error: "Idempotency-Key reused with a different body",
          });
        }
        return res
          .status(existingRecord.status_code)
          .json(existingRecord.response_body);
      }
    }

    // Level 2: Field validation
    let { slot_id, name, email } = req.body || {};

    if (typeof slot_id !== "string" || !slot_id.trim()) {
      return res.status(400).json({ error: "Missing or invalid field" });
    }
    slot_id = slot_id.trim();

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing or invalid field" });
    }
    name = name.trim();

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "Missing or invalid field" });
    }
    email = email.trim().toLowerCase();

    // Standard email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Missing or invalid field" });
    }

    // Check slot exists
    const slot = await db.getSlotById(slot_id);
    if (!slot) {
      return res.status(404).json({ error: "Slot not found" });
    }

    // Check if slot has already started
    const slotStartTime = new Date(slot.start).getTime();
    if (isNaN(slotStartTime) || slotStartTime <= Date.now()) {
      return res.status(400).json({ error: "Slot has already started" });
    }

    // Level 3: Create booking atomically
    const bookingId = "b_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const createdAt = new Date().toISOString();

    const booking = {
      id: bookingId,
      slot_id,
      name,
      email,
      status: "confirmed",
      created_at: createdAt,
    };

    try {
      await db.createBooking(booking);
    } catch (err) {
      if (err.code === "SLOT_ALREADY_BOOKED") {
        return res.status(409).json({ error: "Slot already booked" });
      }
      throw err;
    }

    // Save idempotency record
    if (idempKey) {
      await db.saveIdempotencyRecord({
        key: idempKey,
        request_hash: getBodyHash(req.body),
        status_code: 201,
        response_body: booking,
      });
    }

    return res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
});

// GET /bookings (Level 4)
router.get("/", async (req, res, next) => {
  try {
    const email = req.query.email;
    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "Email is required" });
    }

    let limit = 10;
    if (req.query.limit !== undefined) {
      const rawLimit = String(req.query.limit).trim();
      if (!/^\d+$/.test(rawLimit)) {
        return res.status(400).json({ error: "Invalid limit" });
      }
      const parsed = parseInt(rawLimit, 10);
      if (parsed < 1 || parsed > 50) {
        return res.status(400).json({ error: "Invalid limit" });
      }
      limit = parsed;
    }

    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const db = await getDb();
    const result = await db.listBookings({
      email: email.trim().toLowerCase(),
      limit,
      cursor,
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /bookings/:id (Level 1)
router.get("/:id", async (req, res, next) => {
  try {
    const db = await getDb();
    const booking = await db.getBookingById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: "No booking with that id" });
    }
    return res.status(200).json(booking);
  } catch (err) {
    next(err);
  }
});

// DELETE /bookings/:id (Level 3)
router.delete("/:id", async (req, res, next) => {
  try {
    const db = await getDb();
    const cancelled = await db.cancelBooking(req.params.id);
    return res.status(200).json(cancelled);
  } catch (err) {
    if (err.code === "NOT_FOUND") {
      return res.status(404).json({ error: "No booking with that id" });
    }
    if (err.code === "ALREADY_CANCELLED") {
      return res.status(409).json({ error: "Already cancelled" });
    }
    next(err);
  }
});

module.exports = router;
