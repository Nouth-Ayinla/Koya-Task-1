const config = require("../config");
const PostgresDatabase = require("./postgres");

let dbInstance = null;

async function getDb() {
  if (!dbInstance) {
    if (!config.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not configured. Please set your Neon PostgreSQL connection string in .env (or in Vercel environment variables)."
      );
    }
    console.log("Connecting to Neon PostgreSQL database...");
    dbInstance = new PostgresDatabase(config.DATABASE_URL);
    await dbInstance.init();
    console.log("Connected to Neon PostgreSQL successfully.");
  }
  return dbInstance;
}

module.exports = { getDb };
