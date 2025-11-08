require("dotenv").config();
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

// ✅ Allow frontend access (CORS setup)
app.use(
  cors({
    origin: "https://webshield.vercel.app", // your frontend port
    methods: ["GET", "POST"],
  })
);

// ✅ Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ✅ Basic health check route
app.get("/", (req, res) => {
  res.send("🌐 WebShield backend is running!");
});

// ✅ POST endpoint: Check website safety
app.post(
  "/api/check-url",
  body("url").isURL({ require_protocol: true }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { url } = req.body;

    try {
      // Fetch headers
      const response = await axios.head(url, { maxRedirects: 5, timeout: 8000 });
      const finalUrl = response.request?.res?.responseUrl || url;

      // Fetch HTML content
      const htmlResp = await axios.get(finalUrl, { timeout: 10000 });
      const htmlContent = htmlResp.data.slice(0, 8000);

      // Analyze using LLM
      const llmResult = await analyzeWithLLM(finalUrl, htmlContent);

      // Save to MongoDB
      const scan = new Scan({
        submittedUrl: url,
        finalUrl,
        llmResult,
      });
      await scan.save();

      // ✅ Send response to frontend
      res.json({
        success: true,
        safe: llmResult.includes("safe"), // just an example check
        finalUrl,
        llmResult,
      });
    } catch (error) {
      console.error("❌ Error checking URL:", error.message);
      res.status(500).json({ error: "Failed to check site safety" });
    }
  }
);

// ✅ Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
