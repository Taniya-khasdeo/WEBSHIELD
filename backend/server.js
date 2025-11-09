// Load .env in development
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
app.use(express.json());

// --- PROCESS LEVEL HANDLERS ---
process.on("unhandledRejection", (reason, p) => {
  console.error("UNHANDLED REJECTION at:", p, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

// --- CORS ---
app.use(
  cors({
    origin: ["http://localhost:5713", "https://webshield.vercel.app"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// --- MONGODB ---
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

app.get("/", (req, res) => res.send("🌐 WebShield backend is running!"));

// --- WHITELIST ---
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

function isWhitelisted(finalUrl) {
  if (!finalUrl) return false;
  const norm = finalUrl.toLowerCase();
  return whitelist.some((d) => norm.includes(d));
}

// --- PHISHING DETECTION ---
function detectPhishing(inputUrl) {
  const reasons = [];
  let urlObj;
  try {
    urlObj = new URL(inputUrl);
  } catch (err) {
    return { flagged: true, reasons: ["Invalid URL format"] };
  }

  const hostname = urlObj.hostname.toLowerCase();
  const pathname = urlObj.pathname.toLowerCase();
  const search = urlObj.search.toLowerCase();
  const protocol = urlObj.protocol.toLowerCase();

  if (protocol !== "https:") reasons.push("Uses HTTP or missing HTTPS");

  const suspiciousPatterns = [
    "login","signin","verify","update","account","secure",
    "bank","confirm","ebaylogin","paypal","password","token",
    "auth","session","verify-account",
  ];
  if (
    suspiciousPatterns.some(
      (p) => hostname.includes(p) || pathname.includes(p) || search.includes(p)
    )
  ) {
    reasons.push("Contains suspicious keywords (login / verify / account / token...)");
  }

  const dotCount = (hostname.match(/\./g) || []).length;
  if (dotCount > 3) reasons.push("Multiple subdomains (unusually long hostname)");

  const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  if (ipRegex.test(hostname)) reasons.push("Hostname is an IP address");

  if (inputUrl.includes("@")) reasons.push("Contains '@' symbol");

  if (hostname.includes("xn--")) reasons.push("Punycode domain (possible homograph / IDN attack)");

  const shorteners = [
    "bit.ly","tinyurl.com","t.co","ow.ly","buff.ly","is.gd","goo.gl","rebrand.ly","rb.gy"
  ];
  if (shorteners.some((s) => hostname === s || hostname.endsWith("." + s))) {
    reasons.push("Shortened URL (use caution)");
  }

  if (urlObj.port && urlObj.port !== "80" && urlObj.port !== "443") {
    reasons.push(`Uses non-standard port (${urlObj.port})`);
  }

  if (pathname.length > 200) reasons.push("Very long path");
  if (/%[0-9A-F]{2}/i.test(hostname) || /%[0-9A-F]{2}/i.test(pathname)) {
    reasons.push("Contains percent-encoded characters");
  }

  const suspiciousQueryKeys = ["token","session","auth","password","passwd"];
  const urlSearchParams = new URLSearchParams(urlObj.search);
  for (const key of suspiciousQueryKeys) {
    if (urlSearchParams.has(key)) {
      reasons.push(`Contains query parameter "${key}"`);
      break;
    }
  }

  if (hostname.length > 60) reasons.push("Very long hostname");

  return { flagged: reasons.length > 0, reasons };
}

// --- API ENDPOINT ---
app.post(
  "/api/check-url",
  body("url").isURL({ require_protocol: true }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { url } = req.body;
    let finalUrl = url;

    try {
      console.log(`🔎 Checking URL: ${url}`);

      // HEAD fallback
      try {
        const headResp = await axios.head(url, { maxRedirects: 5, timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } });
        finalUrl = headResp.request?.res?.responseUrl || finalUrl;
      } catch {
        try {
          const getResp = await axios.get(url, { maxRedirects: 5, timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } });
          finalUrl = getResp.request?.res?.responseUrl || finalUrl;
        } catch {
          console.warn("⚠️ Could not follow redirects. Using original URL.");
        }
      }

      if (isWhitelisted(finalUrl)) {
        let llmResult = null;
        try { llmResult = await analyzeWithLLM(finalUrl, ""); } catch {}

        try {
          const scan = new Scan({ submittedUrl: url, finalUrl, llmResult });
          await scan.save();
        } catch (saveErr) { console.warn("⚠️ DB save skipped:", saveErr.message || saveErr); }

        return res.json({
          success: true,
          safe: true,
          finalUrl,
          reasons: ["Domain is whitelisted (trusted)"],
          llmResult,
        });
      }

      const det = detectPhishing(finalUrl);
      if (det.flagged) {
        try { await new Scan({ submittedUrl: url, finalUrl, deterministicFlags: det.reasons }).save(); } catch {}
        return res.json({ success: true, safe: false, finalUrl, reasons: det.reasons, llmResult: null });
      }

      let htmlContent = "";
      try {
        const htmlResp = await axios.get(finalUrl, { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } });
        htmlContent = String(htmlResp.data).slice(0, 8000);
      } catch {}

      let llmResult = null;
      try { llmResult = await analyzeWithLLM(finalUrl, htmlContent); } catch {}

      const safe = !(llmResult && llmResult.verdict && !["safe","legit"].some(v => llmResult.verdict.toLowerCase().includes(v)));
      const reasons = det.reasons.concat(llmResult && llmResult.verdict && !safe ? [`LLM verdict: ${llmResult.verdict}`] : []);

      try { await new Scan({ submittedUrl: url, finalUrl, llmResult, deterministicFlags: det.reasons }).save(); } catch {}

      return res.json({ success: true, safe, finalUrl, reasons, llmResult });
    } catch (error) {
      console.error("❌ /api/check-url thrown error:", error);
      if (error && error.stack) console.error(error.stack);
      return res.status(500).json({
        error: "Failed to check site safety",
        message: error.message || String(error),
        stack: error.stack ? error.stack.split("\n").slice(0,10) : undefined
      });
    }
  }
);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
