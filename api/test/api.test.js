const { test, describe, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const config = require("../src/config");

const API_KEY = config.API_KEY;

// Helper to seed slots
async function seedSlots(slots) {
  await request(app)
    .post("/reset")
    .set("X-API-Key", API_KEY)
    .send({ slots })
    .expect(200);
}

describe("Clinic Booking API — Assessment Test Suite", () => {
  const futureSlot1 = {
    id: "s1",
    provider: "Dr Ade",
    start: "2028-12-10T09:00:00Z",
    end: "2028-12-10T09:30:00Z",
  };

  const futureSlot2 = {
    id: "s2",
    provider: "Dr Bola",
    start: "2028-12-10T10:00:00Z",
    end: "2028-12-10T10:30:00Z",
  };

  const pastSlot = {
    id: "s_past",
    provider: "Dr Ade",
    start: "2020-01-01T09:00:00Z",
    end: "2020-01-01T09:30:00Z",
  };

  beforeEach(async () => {
    await seedSlots([futureSlot1, futureSlot2, pastSlot]);
  });

  describe("Level 2 · Security & Authentication", () => {
    test("rejects request without X-API-Key with 401", async () => {
      const res = await request(app).get("/slots").expect(401);
      assert.ok(res.body.error);
    });

    test("rejects request with invalid X-API-Key with 401", async () => {
      const res = await request(app)
        .get("/slots")
        .set("X-API-Key", "wrong-key")
        .expect(401);
      assert.ok(res.body.error);
    });

    test("allows request with valid X-API-Key", async () => {
      const res = await request(app)
        .get("/slots")
        .set("X-API-Key", API_KEY)
        .expect(200);
      assert.ok(Array.isArray(res.body.slots));
    });
  });

  describe("Level 1 · Core Booking Flow", () => {
    test("POST /reset replaces all slots and wipes bookings", async () => {
      const newSlots = [
        {
          id: "custom1",
          provider: "Dr Musa",
          start: "2029-01-01T08:00:00Z",
          end: "2029-01-01T08:30:00Z",
        },
      ];

      await request(app)
        .post("/reset")
        .set("X-API-Key", API_KEY)
        .send({ slots: newSlots })
        .expect(200);

      const res = await request(app)
        .get("/slots")
        .set("X-API-Key", API_KEY)
        .expect(200);

      assert.equal(res.body.slots.length, 1);
      assert.equal(res.body.slots[0].id, "custom1");
      assert.equal(res.body.slots[0].available, true);
    });

    test("GET /slots returns slots ordered earliest start first", async () => {
      const res = await request(app)
        .get("/slots")
        .set("X-API-Key", API_KEY)
        .expect(200);

      assert.equal(res.body.slots.length, 3);
      assert.equal(res.body.slots[0].id, "s_past");
      assert.equal(res.body.slots[1].id, "s1");
      assert.equal(res.body.slots[2].id, "s2");
    });

    test("GET /slots?provider=... filters by exact provider match", async () => {
      const res = await request(app)
        .get("/slots?provider=Dr%20Bola")
        .set("X-API-Key", API_KEY)
        .expect(200);

      assert.equal(res.body.slots.length, 1);
      assert.equal(res.body.slots[0].provider, "Dr Bola");
    });

    test("POST /bookings creates confirmed booking", async () => {
      const res = await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({
          slot_id: "s1",
          name: "Ada Obi",
          email: "ada@example.com",
        })
        .expect(201);

      assert.ok(res.body.id);
      assert.equal(res.body.slot_id, "s1");
      assert.equal(res.body.name, "Ada Obi");
      assert.equal(res.body.email, "ada@example.com");
      assert.equal(res.body.status, "confirmed");
      assert.ok(res.body.created_at);

      const slotsRes = await request(app)
        .get("/slots")
        .set("X-API-Key", API_KEY)
        .expect(200);
      const slot1 = slotsRes.body.slots.find((s) => s.id === "s1");
      assert.equal(slot1.available, false);
    });

    test("GET /bookings/:id retrieves booking", async () => {
      const createRes = await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({
          slot_id: "s1",
          name: "Ada Obi",
          email: "ada@example.com",
        })
        .expect(201);

      const res = await request(app)
        .get(`/bookings/${createRes.body.id}`)
        .set("X-API-Key", API_KEY)
        .expect(200);

      assert.equal(res.body.id, createRes.body.id);
      assert.equal(res.body.name, "Ada Obi");
    });

    test("GET /bookings/:id returns 404 for unknown id", async () => {
      const res = await request(app)
        .get("/bookings/unknown_id_123")
        .set("X-API-Key", API_KEY)
        .expect(404);

      assert.equal(res.body.error, "No booking with that id");
    });
  });

  describe("Level 2 · Validation & Normalization", () => {
    test("returns 400 if required fields are missing or empty", async () => {
      await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({ name: "Ada", email: "ada@example.com" })
        .expect(400);

      await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({ slot_id: "s1", name: "   ", email: "ada@example.com" })
        .expect(400);

      await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({ slot_id: "s1", name: "Ada" })
        .expect(400);
    });

    test("returns 400 for invalid email format", async () => {
      const res = await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({
          slot_id: "s1",
          name: "Ada Obi",
          email: "notanemail",
        })
        .expect(400);

      assert.ok(res.body.error);
    });

    test("returns 404 if slot does not exist", async () => {
      const res = await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({
          slot_id: "non_existent_slot",
          name: "Ada Obi",
          email: "ada@example.com",
        })
        .expect(404);

      assert.equal(res.body.error, "Slot not found");
    });

    test("returns 400 if slot has already started", async () => {
      const res = await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({
          slot_id: "s_past",
          name: "Ada Obi",
          email: "ada@example.com",
        })
        .expect(400);

      assert.equal(res.body.error, "Slot has already started");
    });

    test("trims spaces and stores email in lower case", async () => {
      const res = await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({
          slot_id: "s1",
          name: "   Ada Obi   ",
          email: "   ADA.OBI@Example.COM   ",
        })
        .expect(201);

      assert.equal(res.body.name, "Ada Obi");
      assert.equal(res.body.email, "ada.obi@example.com");
    });
  });

  describe("Level 3 · Concurrency & Cancellation", () => {
    test("returns 409 when booking an already booked slot", async () => {
      await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({ slot_id: "s1", name: "Ada", email: "ada@example.com" })
        .expect(201);

      const res = await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({ slot_id: "s1", name: "Bob", email: "bob@example.com" })
        .expect(409);

      assert.equal(res.body.error, "Slot already booked");
    });

    test("handles concurrent booking attempts atomically", async () => {
      const promises = Array.from({ length: 10 }).map((_, i) =>
        request(app)
          .post("/bookings")
          .set("X-API-Key", API_KEY)
          .send({
            slot_id: "s2",
            name: `User ${i}`,
            email: `user${i}@example.com`,
          })
      );

      const results = await Promise.all(promises);
      const successes = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);

      assert.equal(successes.length, 1);
      assert.equal(conflicts.length, 9);
    });

    test("DELETE /bookings/:id cancels booking and frees slot", async () => {
      const createRes = await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({ slot_id: "s1", name: "Ada", email: "ada@example.com" })
        .expect(201);

      const cancelRes = await request(app)
        .delete(`/bookings/${createRes.body.id}`)
        .set("X-API-Key", API_KEY)
        .expect(200);

      assert.equal(cancelRes.body.status, "cancelled");

      const slotsRes = await request(app)
        .get("/slots")
        .set("X-API-Key", API_KEY)
        .expect(200);
      const slot1 = slotsRes.body.slots.find((s) => s.id === "s1");
      assert.equal(slot1.available, true);

      await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({ slot_id: "s1", name: "Bob", email: "bob@example.com" })
        .expect(201);
    });

    test("DELETE /bookings/:id returns 409 if already cancelled", async () => {
      const createRes = await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({ slot_id: "s1", name: "Ada", email: "ada@example.com" })
        .expect(201);

      await request(app)
        .delete(`/bookings/${createRes.body.id}`)
        .set("X-API-Key", API_KEY)
        .expect(200);

      const res = await request(app)
        .delete(`/bookings/${createRes.body.id}`)
        .set("X-API-Key", API_KEY)
        .expect(409);

      assert.equal(res.body.error, "Already cancelled");
    });
  });

  describe("Level 4 · Idempotency & Cursor Pagination", () => {
    test("same Idempotency-Key with same body returns identical response without re-booking", async () => {
      const body = { slot_id: "s1", name: "Ada", email: "ada@example.com" };

      const res1 = await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .set("Idempotency-Key", "idem_key_1")
        .send(body)
        .expect(201);

      const res2 = await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .set("Idempotency-Key", "idem_key_1")
        .send(body)
        .expect(201);

      assert.equal(res1.body.id, res2.body.id);
      assert.equal(res1.body.created_at, res2.body.created_at);
    });

    test("same Idempotency-Key with different body returns 422", async () => {
      await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .set("Idempotency-Key", "idem_key_diff")
        .send({ slot_id: "s1", name: "Ada", email: "ada@example.com" })
        .expect(201);

      const res = await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .set("Idempotency-Key", "idem_key_diff")
        .send({ slot_id: "s2", name: "Ada", email: "ada@example.com" })
        .expect(422);

      assert.equal(res.body.error, "Idempotency-Key reused with a different body");
    });

    test("GET /bookings validates limit parameter", async () => {
      await request(app)
        .get("/bookings?email=ada@example.com&limit=0")
        .set("X-API-Key", API_KEY)
        .expect(400);

      await request(app)
        .get("/bookings?email=ada@example.com&limit=51")
        .set("X-API-Key", API_KEY)
        .expect(400);

      await request(app)
        .get("/bookings?email=ada@example.com&limit=abc")
        .set("X-API-Key", API_KEY)
        .expect(400);
    });

    test("GET /bookings supports cursor pagination and case-insensitive email", async () => {
      const slots = [
        { id: "s10", provider: "Dr A", start: "2028-01-01T10:00:00Z", end: "2028-01-01T10:30:00Z" },
        { id: "s11", provider: "Dr A", start: "2028-01-01T11:00:00Z", end: "2028-01-01T11:30:00Z" },
        { id: "s12", provider: "Dr A", start: "2028-01-01T12:00:00Z", end: "2028-01-01T12:30:00Z" },
      ];
      await seedSlots(slots);

      await request(app).post("/bookings").set("X-API-Key", API_KEY).send({ slot_id: "s10", name: "Ada", email: "ada@example.com" }).expect(201);
      await request(app).post("/bookings").set("X-API-Key", API_KEY).send({ slot_id: "s11", name: "Ada", email: "ADA@EXAMPLE.COM" }).expect(201);
      await request(app).post("/bookings").set("X-API-Key", API_KEY).send({ slot_id: "s12", name: "Ada", email: "ada@example.com" }).expect(201);

      const page1 = await request(app)
        .get("/bookings?email=Ada@Example.com&limit=2")
        .set("X-API-Key", API_KEY)
        .expect(200);

      assert.equal(page1.body.bookings.length, 2);
      assert.ok(page1.body.next_cursor);

      const page2 = await request(app)
        .get(`/bookings?email=Ada@Example.com&limit=2&cursor=${encodeURIComponent(page1.body.next_cursor)}`)
        .set("X-API-Key", API_KEY)
        .expect(200);

      assert.equal(page2.body.bookings.length, 1);
      assert.equal(page2.body.next_cursor, null);
    });
  });

  describe("Level 5 · Rate Limiting", () => {
    test("at most 5 attempts per email per minute, 6th returns 429 with Retry-After header", async () => {
      const email = "spammer@example.com";

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post("/bookings")
          .set("X-API-Key", API_KEY)
          .send({ slot_id: "non_existent", name: "Spam", email })
          .expect(404);
      }

      const blockedRes = await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({ slot_id: "s1", name: "Spam", email })
        .expect(429);

      assert.equal(blockedRes.body.error, "Too many attempts for this email");
      const retryAfter = blockedRes.headers["retry-after"];
      assert.ok(retryAfter);
      assert.ok(parseInt(retryAfter, 10) > 0);

      await request(app)
        .post("/bookings")
        .set("X-API-Key", API_KEY)
        .send({ slot_id: "s1", name: "Good User", email: "other@example.com" })
        .expect(201);
    });
  });
});
