const app = require("./src/app");
const config = require("./src/config");
const { getDb } = require("./src/db");

async function startServer() {
  try {
    await getDb();

    app.listen(config.PORT, () => {
      console.log(`Clinic Booking API running on port ${config.PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();

module.exports = app;
