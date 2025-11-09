const { OpenAI } = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function analyzeWithLLM(url, html) {
  const prompt = `
You are a cybersecurity assistant.
Analyze the following webpage content and URL, and decide whether it is safe or a phishing attempt.
Return result as JSON with:
{
  "verdict": "safe" | "phishing" | "suspicious",
  "confidence": "0-100",
  "reasons": ["reason1", "reason2"]
}

URL: ${url}
HTML: ${html.slice(0, 6000)}
`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });

    const text = response.choices[0].message.content;

    // Parse safely
    const parsed = JSON.parse(text);

    return {
      verdict: parsed.verdict || "unknown",
      confidence: parsed.confidence || "0",
      reasons: parsed.reasons || [],
    };
  } catch (err) {
    console.warn("⚠️ LLM parse error:", err.message);
    return {
      verdict: "unknown",
      confidence: "0",
      reasons: ["Unable to parse response from LLM"],
    };
  }
}

module.exports = { analyzeWithLLM };
