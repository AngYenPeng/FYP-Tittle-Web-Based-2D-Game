const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema({
  title: String,
  content: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: String,
    default: "admin"
  }
});

module.exports = mongoose.model("Announcement", announcementSchema);