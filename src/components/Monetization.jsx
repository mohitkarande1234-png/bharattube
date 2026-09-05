import React from "react";
import "./Monetization.css";
function Monetization() {
  return (
    <div className="monetization-page">
      <div className="monetization-header">
        <h1>💰 Monetization</h1>
        <p>Earn money from your BharatTube content</p>
      </div>

      <div className="earnings-grid">
        <div className="earning-card">
          <span>💵</span>
          <h3>Total Earnings</h3>
          <strong>₹0.00</strong>
        </div>

        <div className="earning-card">
          <span>👁️</span>
          <h3>Total Views</h3>
          <strong>0</strong>
        </div>

        <div className="earning-card">
          <span>🎬</span>
          <h3>Monetized Videos</h3>
          <strong>0</strong>
        </div>

        <div className="earning-card">
          <span>💳</span>
          <h3>Available Balance</h3>
          <strong>₹0.00</strong>
        </div>
      </div>

      <div className="monetization-box">
        <h2>🚀 Monetization Program</h2>

        <p>
          Start earning from your videos when your channel becomes
          eligible for BharatTube Monetization.
        </p>

        <div className="requirements">
          <div>
            <span>✓</span>
            <p>Active BharatTube account</p>
          </div>

          <div>
            <span>✓</span>
            <p>Upload original videos</p>
          </div>

          <div>
            <span>✓</span>
            <p>Follow BharatTube community guidelines</p>
          </div>

          <div>
            <span>✓</span>
            <p>Meet monetization eligibility requirements</p>
          </div>
        </div>

        <button className="monetization-button">
          Check Eligibility
        </button>
      </div>

      <div className="monetization-box">
        <h2>📊 Earnings Overview</h2>

        <div className="empty-earnings">
          <div>💰</div>
          <h3>No earnings yet</h3>
          <p>
            Upload videos and grow your audience to start earning.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Monetization;