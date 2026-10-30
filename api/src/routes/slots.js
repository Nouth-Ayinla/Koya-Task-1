const express = require("express");
const { getDb } = require("../db");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const provider = req.query.provider ? String(req.query.provider) : null;
    const db = await getDb();
    const slots = await db.getSlots(provider);
    return res.status(200).json({ slots });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
