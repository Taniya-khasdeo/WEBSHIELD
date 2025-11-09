// ✅ Load environment variables (only in development)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const cors = require("cors");
const { body, validationResult } = require("express-validator");
const { analyzeWithLLM } = require("./llm");
const Scan = require("./models/scan");

const app = express();

// ✅ Middleware
app.use(express.json());

// ✅ CORS setup for local + deployed frontend
app.use(
  cors({
    origin: ["http://localhost:5713", "https://webshield.vercel.app"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Handle OPTIONS preflight
app.options("*", cors());

// ✅ Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ Health check
app.get("/", (req, res) => res.send("🌐 WebShield backend is running!"));

// ✅ Whitelist of known safe domains
const whitelist = [
  "google.com",
  "github.com",
  "mozilla.org",
  "example.com",
  "spotify.com",
  "wikipedia.org",
  "microsoft.com",
  "amazon.com",
];

// ✅ POST endpoint: Check URL safety
app.post(
  "/api/check-url",
  body("url").isURL({ require_protocol: true }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { url } = req.body;

    try {
      console.log(`🔎 Checking URL: ${url}`);

      // Step 1: Get final URL after redirects
      const response = await axios.head(url, {
        maxRedirects: 5,
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      });
      const finalUrl = response.request?.res?.responseUrl || url;

      // Step 2: Fetch HTML content (first 8KB)
      const htmlResp = await axios.get(finalUrl, {
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      });
      const htmlContent = htmlResp.data.slice(0, 8000);

      // Step 3: Analyze with LLM (AI)
      const llmResult = await analyzeWithLLM(finalUrl, htmlContent);

      // Step 4: Save scan record to MongoDB
      const scan = new Scan({ submittedUrl: url, finalUrl, llmResult });
      await scan.save();

      // Step 5: Check whitelist or LLM verdict
      const normalizedUrl = finalUrl.toLowerCase();
      let safe = false;

      if (whitelist.some((domain) => normalizedUrl.includes(domain))) {
        safe = true;
      } else if (llmResult && llmResult.verdict) {
        const verdict = llmResult.verdict.toLowerCase();
        safe = verdict.includes("safe") || verdict.includes("legit");
      }

      // Debug logging
      console.log(`✅ Verdict: ${safe ? "SAFE" : "PHISHING"} | URL: ${finalUrl}`);

      // Step 6: Send response
      res.json({
        success: true,
        safe,
        finalUrl,
        llmResult,
      });
    } catch (error) {
      console.error("❌ Error checking URL:", error.message);
      res.status(500).json({ error: "Failed to check site safety" });
    }
  }
);

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);

