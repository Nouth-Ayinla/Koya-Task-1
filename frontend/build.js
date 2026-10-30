const fs = require("fs");
const path = require("path");

// Automatically load .env if present
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...vals] = trimmed.split("=");
    if (key && vals.length > 0 && !process.env[key.trim()]) {
      process.env[key.trim()] = vals.join("=").trim().replace(/^["']|["']$/g, "");
    }
  });
}

const apiBase = process.env.API_BASE_URL;

if (!apiBase) {
  console.error("❌ ERROR: API_BASE_URL is not set!");
  console.error("Please set API_BASE_URL in frontend/.env or in your Vercel Project Settings.");
  process.exit(1);
}

const configContent = `// Auto-generated during build from environment variable API_BASE_URL
window.CLINIC_CONFIG = {
  API_BASE_URL: "${apiBase.trim().replace(/\/$/, "")}"
};
`;

fs.writeFileSync(path.join(__dirname, "config.js"), configContent, "utf8");
console.log(`✓ Frontend successfully configured with API_BASE_URL: ${apiBase.trim()}`);
