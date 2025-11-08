import React, { useState } from "react";
import "./home.css";

function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCheck = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult("");

    try {
      const apiUrl = import.meta.env.VITE_API_URL;

      const response = await fetch(`${apiUrl}/api/check-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      let data;
      try {
        data = await response.json();
      } catch (err) {
        console.error("❌ Failed to parse JSON:", err);
        setResult("❌ Server returned invalid response. Try again later.");
        setLoading(false);
        return;
      }

      // Show verdict, confidence, and reasons
      if (data.llmResult) {
        const { verdict, confidence, reasons } = data.llmResult;
        setResult(
          `🔹 Verdict: ${verdict.toUpperCase()}\n🔹 Confidence: ${confidence}%\n🔹 Reasons: ${reasons.join(
            ", "
          )}`
        );
      } else {
        setResult(
          data.safe
            ? "✅ This website appears safe."
            : "⚠️ Potential phishing link detected! Be cautious."
        );
      }
    } catch (error) {
      console.error("Error checking URL:", error);
      setResult("❌ Error connecting to the server. Try again later.");
    }

    setLoading(false);
  };

  return (
    <>
      <section className="hero-section">
        <div className="container text-center hero-content">
          <h1 className="fw-bold mb-3 text-white">
            Shield Yourself from Online Threats 🛡️
          </h1>
          <p className="text-light mb-4 lead">
            WebShield helps you detect and prevent phishing websites before you click.
          </p>

          <form
            onSubmit={handleCheck}
            className="d-flex justify-content-center mb-3"
          >
            <input
              type="text"
              className="form-control w-50 me-2"
              placeholder="Enter website URL (https://example.com)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <button
              type="submit"
              className="btn btn-warning fw-bold"
              disabled={loading}
            >
              {loading ? "Checking..." : "Check"}
            </button>
          </form>

          {result && (
            <div
              className="alert alert-info result-box mx-auto mt-3"
              style={{ whiteSpace: "pre-line" }}
            >
              {result}
            </div>
          )}

          <div className="features mt-5">
            <div className="row text-light">
              <div className="col-md-4">
                <h4>🔍 Real-time Analysis</h4>
                <p>Check suspicious links instantly with AI-powered scanning.</p>
              </div>
              <div className="col-md-4">
                <h4>🧠 Learn & Stay Aware</h4>
                <p>Visit our Glossary page to understand cybersecurity terms.</p>
              </div>
              <div className="col-md-4">
                <h4>💡 Safe Browsing Tips</h4>
                <p>Always verify site URLs before entering your credentials.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer text-center text-light py-3">
        <div className="container">
          <p className="mb-1">👩‍💻 Developed by</p>
          <p className="names mb-0">
            Samiksha Agrawal • Taniya Khasdeo • Vanshika Joshi
          </p>
        </div>
      </footer>
    </>
  );
}

export default Home;
