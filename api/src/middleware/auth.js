const config = require("../config");

function requireApiKey(req, res, next) {
  // CORS preflight requests bypass auth
  if (req.method === "OPTIONS") {
    return next();
  }

  const providedKey = req.header("X-API-Key");

  if (!providedKey || providedKey !== config.API_KEY) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }

  next();
}

module.exports = { requireApiKey };
