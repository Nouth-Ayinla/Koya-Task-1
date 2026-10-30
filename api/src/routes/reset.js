const express = require("express");
const { getDb } = require("../db");

const router = express.Router();

router.post("/", async (req, res, next) => {
  try {
    const slots = req.body && Array.isArray(req.body.slots) ? req.body.slots : [];
    const db = await getDb();
    await db.reset(slots);
    return res.status(200).json({});
  } catch (err) {
    next(err);
  }
});

module.exports = router;
