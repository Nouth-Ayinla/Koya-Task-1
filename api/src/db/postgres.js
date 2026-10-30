const { Pool } = require("pg");

class PostgresDatabase {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.pool = new Pool({
      connectionString: this.connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.pool.on("error", (err) => {
      console.error("Unexpected error on idle PostgreSQL client:", err);
    });
  }

  async init() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS slots (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          start TEXT NOT NULL,
          "end" TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS bookings (
          id TEXT PRIMARY KEY,
          slot_id TEXT NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('confirmed', 'cancelled')),
          created_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_confirmed_slot
          ON bookings (slot_id) WHERE status = 'confirmed';

        CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(email);
        CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at);

        CREATE TABLE IF NOT EXISTS idempotency_keys (
          key TEXT PRIMARY KEY,
          request_hash TEXT NOT NULL,
          status_code INT NOT NULL,
          response_body TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rate_limit_attempts (
          id SERIAL PRIMARY KEY,
          email TEXT NOT NULL,
          timestamp BIGINT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_rate_limit_email_ts
          ON rate_limit_attempts(email, timestamp);
      `);
    } finally {
      client.release();
    }
  }

  async reset(slots) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");
      await client.query("DELETE FROM bookings;");
      await client.query("DELETE FROM slots;");
      await client.query("DELETE FROM idempotency_keys;");
      await client.query("DELETE FROM rate_limit_attempts;");

      for (const slot of slots) {
        await client.query(
          `INSERT INTO slots (id, provider, start, "end") VALUES ($1, $2, $3, $4)`,
          [slot.id, slot.provider, slot.start, slot.end]
        );
      }
      await client.query("COMMIT;");
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async getSlots(provider = null) {
    let sql = `
      SELECT 
        s.id, 
        s.provider, 
        s.start, 
        s."end",
        CASE WHEN b.id IS NOT NULL THEN FALSE ELSE TRUE END AS available
      FROM slots s
      LEFT JOIN bookings b ON b.slot_id = s.id AND b.status = 'confirmed'
    `;
    const params = [];

    if (provider) {
      sql += " WHERE s.provider = $1 ORDER BY s.start ASC;";
      params.push(provider);
    } else {
      sql += " ORDER BY s.start ASC;";
    }

    const { rows } = await this.pool.query(sql, params);
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      start: r.start,
      end: r.end,
      available: Boolean(r.available),
    }));
  }

  async getSlotById(id) {
    const { rows } = await this.pool.query(
      `SELECT id, provider, start, "end" FROM slots WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  async getBookingById(id) {
    const { rows } = await this.pool.query(
      `SELECT id, slot_id, name, email, status, created_at FROM bookings WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  async createBooking({ id, slot_id, name, email, status, created_at }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      const checkRes = await client.query(
        `SELECT id FROM bookings WHERE slot_id = $1 AND status = 'confirmed' FOR UPDATE`,
        [slot_id]
      );

      if (checkRes.rows.length > 0) {
        await client.query("ROLLBACK;");
        const error = new Error("Slot already booked");
        error.code = "SLOT_ALREADY_BOOKED";
        throw error;
      }

      await client.query(
        `INSERT INTO bookings (id, slot_id, name, email, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, slot_id, name, email, status, created_at]
      );

      await client.query("COMMIT;");
      return { id, slot_id, name, email, status, created_at };
    } catch (err) {
      try {
        await client.query("ROLLBACK;");
      } catch (rbErr) {}

      if (err.code === "23505") {
        const error = new Error("Slot already booked");
        error.code = "SLOT_ALREADY_BOOKED";
        throw error;
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async cancelBooking(id) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      const res = await client.query(
        `SELECT id, slot_id, name, email, status, created_at FROM bookings WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (res.rows.length === 0) {
        await client.query("ROLLBACK;");
        const error = new Error("No booking with that id");
        error.code = "NOT_FOUND";
        throw error;
      }

      const booking = res.rows[0];
      if (booking.status === "cancelled") {
        await client.query("ROLLBACK;");
        const error = new Error("Already cancelled");
        error.code = "ALREADY_CANCELLED";
        throw error;
      }

      await client.query(
        `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
        [id]
      );
      await client.query("COMMIT;");

      booking.status = "cancelled";
      return booking;
    } catch (err) {
      try {
        await client.query("ROLLBACK;");
      } catch (rbErr) {}
      throw err;
    } finally {
      client.release();
    }
  }

  async listBookings({ email, limit = 10, cursor = null }) {
    let cursorTime = null;
    let cursorId = null;

    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64").toString("utf8");
        const parts = decoded.split("::");
        if (parts.length === 2) {
          cursorTime = parts[0];
          cursorId = parts[1];
        }
      } catch (err) {}
    }

    const fetchLimit = limit + 1;
    let sql = `
      SELECT id, slot_id, name, email, status, created_at
      FROM bookings
      WHERE LOWER(email) = LOWER($1)
    `;
    const params = [email];

    if (cursorTime && cursorId) {
      sql += ` AND (created_at > $2 OR (created_at = $2 AND id > $3))`;
      params.push(cursorTime, cursorId);
      sql += ` ORDER BY created_at ASC, id ASC LIMIT $4`;
      params.push(fetchLimit);
    } else {
      sql += ` ORDER BY created_at ASC, id ASC LIMIT $2`;
      params.push(fetchLimit);
    }

    const { rows } = await this.pool.query(sql, params);

    let next_cursor = null;
    let bookings = rows;

    if (rows.length > limit) {
      bookings = rows.slice(0, limit);
      const lastItem = bookings[bookings.length - 1];
      next_cursor = Buffer.from(`${lastItem.created_at}::${lastItem.id}`).toString("base64");
    }

    return { bookings, next_cursor };
  }

  async getIdempotencyRecord(key) {
    const { rows } = await this.pool.query(
      `SELECT key, request_hash, status_code, response_body FROM idempotency_keys WHERE key = $1`,
      [key]
    );
    if (rows.length === 0) return null;
    return {
      key: rows[0].key,
      request_hash: rows[0].request_hash,
      status_code: rows[0].status_code,
      response_body: JSON.parse(rows[0].response_body),
    };
  }

  async saveIdempotencyRecord({ key, request_hash, status_code, response_body }) {
    await this.pool.query(
      `INSERT INTO idempotency_keys (key, request_hash, status_code, response_body, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO UPDATE SET
         request_hash = EXCLUDED.request_hash,
         status_code = EXCLUDED.status_code,
         response_body = EXCLUDED.response_body,
         created_at = EXCLUDED.created_at`,
      [
        key,
        request_hash,
        status_code,
        JSON.stringify(response_body),
        new Date().toISOString(),
      ]
    );
  }

  async recordRateLimitAttempt(email, timestamp) {
    await this.pool.query(
      `INSERT INTO rate_limit_attempts (email, timestamp) VALUES ($1, $2)`,
      [email.toLowerCase(), timestamp]
    );
  }

  async getRecentRateLimitAttempts(email, windowStartMs) {
    const { rows } = await this.pool.query(
      `SELECT timestamp FROM rate_limit_attempts WHERE LOWER(email) = LOWER($1) AND timestamp >= $2 ORDER BY timestamp ASC`,
      [email, windowStartMs]
    );
    return rows.map((r) => Number(r.timestamp));
  }

  async pruneRateLimits(beforeMs) {
    try {
      await this.pool.query(
        `DELETE FROM rate_limit_attempts WHERE timestamp < $1`,
        [beforeMs]
      );
    } catch (err) {}
  }
}

module.exports = PostgresDatabase;
