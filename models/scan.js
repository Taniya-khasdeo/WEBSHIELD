const mongoose = require("mongoose");

const scanSchema = new mongoose.Schema({
  submittedUrl: String,
  finalUrl: String,
  llmResult: Object,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Scan", scanSchema);
