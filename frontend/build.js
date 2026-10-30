const fs = require("fs");
const path = require("path");

// Load frontend/.env if it exists
const envPath = path.join(__dirname, ".env");
const envVars = { ...process.env };

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...vals] = trimmed.split("=");
    if (key && vals.length > 0) {
      envVars[key.trim()] = vals.join("=").trim().replace(/^["']|["']$/g, "");
    }
  });
}

const apiBase = (envVars.API_BASE_URL || "").replace(/\/$/, "");
const apiKey = envVars.API_KEY || "";

if (!apiBase) {
  console.warn("⚠️ Warning: API_BASE_URL is not set in environment or .env.");
}
if (!apiKey) {
  console.warn("⚠️ Warning: API_KEY is not set in environment or .env.");
}

const configContent = `// Automatically generated from environment variables — do not edit manually or commit to git
window.CLINIC_CONFIG = {
  API_BASE_URL: ${JSON.stringify(apiBase)},
  API_KEY: ${JSON.stringify(apiKey)}
};
`;

fs.writeFileSync(path.join(__dirname, "config.js"), configContent, "utf8");
console.log("✅ config.js generated successfully.");

