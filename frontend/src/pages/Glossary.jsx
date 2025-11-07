import React from "react";
import "./glossary.css";

function Glossary() {
  return (
    <section className="glossary-section">
      <div className="container">
        <h2 className="fw-bold mb-4 text-center text-white">
          Cybersecurity Glossary 🔐
        </h2>
        <p className="text-center text-light mb-5">
          Understand the common terms and concepts to strengthen your digital safety.
        </p>

        <div className="row justify-content-center">
          <div className="col-md-8">
            <ul className="list-group shadow glossary-list">
              <li className="list-group-item">
                <strong>Phishing:</strong> Fraudulent attempt to steal sensitive information via deceptive emails or websites.
              </li>
              <li className="list-group-item">
                <strong>Malware:</strong> Software designed to damage or gain unauthorized access to systems.
              </li>
              <li className="list-group-item">
                <strong>SSL/TLS:</strong> Encryption protocols that secure data transfers between your browser and websites.
              </li>
              <li className="list-group-item">
                <strong>Firewall:</strong> A system designed to block unauthorized access while permitting legitimate traffic.
              </li>
              <li className="list-group-item">
                <strong>Two-Factor Authentication (2FA):</strong> A security method requiring two forms of verification.
              </li>
              <li className="list-group-item">
                <strong>HTTPS:</strong> A secure version of HTTP that ensures encrypted communication between you and the website.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Glossary;
