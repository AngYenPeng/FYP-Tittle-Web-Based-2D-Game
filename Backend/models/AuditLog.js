const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  username: {
    type: String,
    default: "Unknown"
  },

  role: {
    type: String,
    default: "guest"
  },

  target: {
    type: String,
    default: ""
  },

  method: {
    type: String,
    default: ""
  },

  endpoint: {
    type: String,
    default: ""
  },

  ipAddress: {
    type: String,
    default: ""
  },

  userAgent: {
    type: String,
    default: ""
  },

  status: {
    type: String,
    enum: ["SUCCESS", "FAILED"],
    default: "SUCCESS"
  },

  details: {
    type: String,
    default: ""
  }

}, {
  timestamps: true
});

module.exports = mongoose.model("AuditLog", auditLogSchema);