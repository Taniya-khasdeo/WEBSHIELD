// Load .env only in development
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

// Middleware
app.use(express.json());

// CORS setup
app.use(
  cors({
    origin: [
      "http://localhost:5713",         // local frontend
      "https://webshield.vercel.app",  // production frontend
    ],
    methods: ["GET", "POST"],
  })
);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Health check
app.get("/", (req, res) => res.send("🌐 WebShield backend is running!"));

// POST endpoint
app.post(
  "/api/check-url",
  body("url").isURL({ require_protocol: true }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { url } = req.body;

    try {
      const response = await axios.head(url, { maxRedirects: 5, timeout: 8000 });
      const finalUrl = response.request?.res?.responseUrl || url;

      const htmlResp = await axios.get(finalUrl, { timeout: 10000 });
      const htmlContent = htmlResp.data.slice(0, 8000);

      const llmResult = await analyzeWithLLM(finalUrl, htmlContent);

      const scan = new Scan({ submittedUrl: url, finalUrl, llmResult });
      await scan.save();

      res.json({
        success: true,
        safe: llmResult.includes("safe"),
        finalUrl,
        llmResult,
      });
    } catch (error) {
      console.error("❌ Error checking URL:", error.message);
      res.status(500).json({ error: "Failed to check site safety" });
    }
  }
);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

