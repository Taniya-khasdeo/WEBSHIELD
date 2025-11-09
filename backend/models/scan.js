const mongoose = require("mongoose");

const scanSchema = new mongoose.Schema({
  submittedUrl: { type: String, required: true },
  finalUrl: { type: String, required: true },
  deterministicFlags: { type: [String], default: [] },
  llmResult: { type: Object, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Scan", scanSchema);


