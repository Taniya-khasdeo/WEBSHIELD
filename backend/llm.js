const { OpenAI } = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function analyzeWithLLM(url, html) {
  const prompt = `
You are a cybersecurity assistant.

Return ONLY valid JSON.
Do NOT include any explanation, text, markdown, backticks, or comments.

Use exactly this schema:
{
  "verdict": "safe" | "phishing" | "suspicious",
  "confidence": <number between 0 and 100>,
  "reasons": ["reason1", "reason2"]
}

Analyze this webpage:

URL: "${url}"
HTML: "${html.slice(0, 6000)}"
  `;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });

    let text = response.choices[0].message.content.trim();

    // 🧹 Remove extra text (LLM sometimes adds explanations)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in LLM response");

    const jsonString = jsonMatch[0]; // Extract only the JSON part

    const parsed = JSON.parse(jsonString);

    return {
      verdict: parsed.verdict || "unknown",
      confidence: parsed.confidence || 0,
      reasons: parsed.reasons || [],
    };

  } catch (err) {
    console.warn("⚠️ LLM parse error:", err.message);

    return {
      verdict: "unknown",
      confidence: 0,
      reasons: ["Unable to parse response from LLM"],
    };
  }
}

module.exports = { analyzeWithLLM };
