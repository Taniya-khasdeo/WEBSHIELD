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

app.use(
  cors({
    origin: ["http://localhost:5713", "https://webshield.vercel.app"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

app.get("/", (req, res) => res.send("🌐 WebShield backend is running!"));

// A small whitelist for known-trusted domains (always allowed)
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

// Helper: quick domain-only check for whitelist
function isWhitelisted(finalUrl) {
  if (!finalUrl) return false;
  const norm = finalUrl.toLowerCase();
  return whitelist.some((d) => norm.includes(d));
}

/**
 * detectPhishing(url)
 * - Performs deterministic checks that commonly indicate phishing.
 * - Returns an object: { flagged: boolean, reasons: string[] }
 *
 * Checks performed:
 * - Missing HTTPS (http only)
 * - Suspicious keywords in hostname / path (login, verify, secure, etc.)
 * - Too many subdomains (multiple dots)
 * - Host is an IP address
 * - Contains @ symbol (rarely used by legitimate sites)
 * - Punycode (xn--) possibility of homograph attacks
 * - Known URL shorteners
 * - Port numbers other than 80/443
 * - Excessive path length
 * - Encoded chars in hostname (percent-encoding)
 * - Suspicious query parameters (token, session, auth, password)
 */
function detectPhishing(inputUrl) {
  const reasons = [];

  let urlObj;
  try {
    urlObj = new URL(inputUrl);
  } catch (err) {
    // If URL constructor fails, immediate invalid URL — treat as flagged
    return { flagged: true, reasons: ["Invalid URL format"] };
  }

  const hostname = urlObj.hostname.toLowerCase();
  const pathname = urlObj.pathname.toLowerCase();
  const search = urlObj.search.toLowerCase();
  const protocol = urlObj.protocol.toLowerCase(); // 'https:' or 'http:'

  // 1) HTTPS check
  if (protocol !== "https:") {
    reasons.push("Uses HTTP or missing HTTPS — secure connection expected");
  }

  // 2) Suspicious keywords in hostname or path
  const suspiciousPatterns = [
    "login",
    "signin",
    "verify",
    "update",
    "account",
    "secure",
    "bank",
    "confirm",
    "ebaylogin",
    "paypal",
    "password",
    "token",
    "auth",
    "session",
    "verify-account",
  ];
  if (
    suspiciousPatterns.some(
      (p) => hostname.includes(p) || pathname.includes(p) || search.includes(p)
    )
  ) {
    reasons.push("Contains suspicious keywords (login / verify / account / token...)");
  }

  // 3) Multiple subdomains (excessive dots)
  const dotCount = (hostname.match(/\./g) || []).length;
  if (dotCount > 3) {
    reasons.push("Multiple subdomains (unusually long hostname)");
  }

  // 4) IP address instead of domain
  const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  if (ipRegex.test(hostname)) {
    reasons.push("Hostname is an IP address (often used to hide domain identity)");
  }

  // 5) '@' symbol in URL (rare and suspicious)
  if (inputUrl.includes("@")) {
    reasons.push("Contains '@' symbol (could be used to obfuscate actual destination)");
  }

  // 6) Punycode / xn-- (possible homograph attacks)
  if (hostname.includes("xn--")) {
    reasons.push("Punycode domain (possible homograph / IDN attack)");
  }

  // 7) Known URL shorteners
  const shorteners = [
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "ow.ly",
    "buff.ly",
    "is.gd",
    "goo.gl",
    "rebrand.ly",
    "rb.gy",
  ];
  if (shorteners.some((s) => hostname === s || hostname.endsWith("." + s))) {
    reasons.push("Shortened URL (use caution; may hide final destination)");
  }

  // 8) Non-standard port
  if (urlObj.port && urlObj.port !== "80" && urlObj.port !== "443") {
    reasons.push(`Uses non-standard port (${urlObj.port})`);
  }

  // 9) Excessive path length
  if (pathname.length > 200) {
    reasons.push("Very long path (may attempt to hide malicious parameters)");
  }

  // 10) Percent-encoded characters in hostname or path
  if (/%[0-9A-F]{2}/i.test(hostname) || /%[0-9A-F]{2}/i.test(pathname)) {
    reasons.push("Contains percent-encoded characters (obfuscation)");
  }

  // 11) Suspicious query params
  const suspiciousQueryKeys = ["token", "session", "auth", "password", "passwd"];
  const urlSearchParams = new URLSearchParams(urlObj.search);
  for (const key of suspiciousQueryKeys) {
    if (urlSearchParams.has(key)) {
      reasons.push(`Contains query parameter "${key}" (sensitive-looking)`);
      break;
    }
  }

  // 12) Very long hostname (lots of characters)
  if (hostname.length > 60) {
    reasons.push("Very long hostname (possible autogenerated domain)");
  }

  // Final decision
  const flagged = reasons.length > 0;
  return { flagged, reasons };
}

// POST endpoint: Check URL safety (uses detectPhishing logic)
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

      // Attempt to get final URL after redirects using HEAD
      let finalUrl = url;
      try {
        const headResp = await axios.head(url, {
          maxRedirects: 5,
          timeout: 8000,
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        });
        finalUrl = headResp.request?.res?.responseUrl || finalUrl;
      } catch (headErr) {
        // HEAD may fail on some servers (Cloudflare, etc.). We'll fallback to GET for final location.
        try {
          const getResp = await axios.get(url, {
            maxRedirects: 5,
            timeout: 10000,
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
          });
          finalUrl = getResp.request?.res?.responseUrl || finalUrl;
        } catch (getErr) {
          // Could not resolve final URL via requests — keep original URL
          console.warn("⚠️ Could not follow redirects to determine final URL. Using submitted URL.");
        }
      }

      // Quick whitelist check (trusted first)
      if (isWhitelisted(finalUrl)) {
        const llmResult = await (async () => {
          try {
            // still call LLM asynchronously for logging/extra info but don't let its verdict override whitelist
            return await analyzeWithLLM(finalUrl, "");
          } catch (e) {
            return null;
          }
        })();

        const scan = new Scan({ submittedUrl: url, finalUrl, llmResult });
        await scan.save();

        return res.json({
          success: true,
          safe: true,
          finalUrl,
          reasons: ["Domain is whitelisted (trusted)"],
          llmResult,
        });
      }

      // Deterministic checks
      const det = detectPhishing(finalUrl);

      if (det.flagged) {
        // Save scan and respond with reasons (no need to call LLM)
        const scan = new Scan({ submittedUrl: url, finalUrl, deterministicFlags: det.reasons });
        await scan.save();

        return res.json({
          success: true,
          safe: false,
          finalUrl,
          reasons: det.reasons,
          llmResult: null,
        });
      }

      // If deterministic checks passed (no flags), fetch a small chunk of HTML and consult LLM for deeper analysis
      let htmlContent = "";
      try {
        const htmlResp = await axios.get(finalUrl, {
          timeout: 10000,
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        });
        htmlContent = String(htmlResp.data).slice(0, 8000);
      } catch (e) {
        console.warn("⚠️ Unable to fetch HTML content — continuing with LLM call using finalUrl only.");
      }

      // Call LLM for semantic check (optional and helpful)
      let llmResult = null;
      try {
        llmResult = await analyzeWithLLM(finalUrl, htmlContent);
      } catch (llmErr) {
        console.warn("⚠️ LLM analysis failed or timed out:", llmErr.message || llmErr);
      }

      // Decide based on LLM if available; otherwise accept deterministic pass as safe
      let safe = true;
      const reasons = [];

      if (llmResult && llmResult.verdict) {
        const verdict = String(llmResult.verdict).toLowerCase();
        if (verdict.includes("safe") || verdict.includes("legit")) {
          safe = true;
        } else {
          safe = false;
          reasons.push(`LLM verdict: ${llmResult.verdict}`);
        }
      } else {
        // No LLM verdict — deterministic checks passed, consider site safe for now
        safe = true;
      }

      // Save and respond
      const scan = new Scan({ submittedUrl: url, finalUrl, llmResult, deterministicFlags: det.reasons });
      await scan.save();

      const resp = {
        success: true,
        safe,
        finalUrl,
        reasons: det.reasons.concat(reasons), // both deterministic and LLM reasons
        llmResult,
      };

      console.log(`✅ Result for ${finalUrl}: safe=${safe} reasons=${resp.reasons.join(" | ")}`);

      return res.json(resp);
    } catch (error) {
      console.error("❌ Error checking URL:", error.message || error);
      return res.status(500).json({ error: "Failed to check site safety" });
    }
  }
);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

