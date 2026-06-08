const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
  action: String,
  performedBy: String,
  target: String,
  details: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);