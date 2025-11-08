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
      // Send URL to backend API
      const response = await fetch("https://webshield-l4t8.onrender.com", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (data.safe) {
        setResult("✅ This website appears safe.");
      } else {
        setResult("⚠️ Potential phishing link detected! Be cautious.");
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

          {/* URL input form */}
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

          {/* Result box */}
          {result && (
            <div className="alert alert-info result-box mx-auto mt-3">
              {result}
            </div>
          )}

          {/* Features Section */}
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

      {/* Footer Section */}
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



