const mongoose = require("mongoose");

const supportTicketSchema = new mongoose.Schema({
  username: String,
  email: String,
  message: String,
  status: {
    type: String,
    default: "pending"
  },
  createdAt: {
    type: Date,
    default: Date.now
  },

  reply: {
  type: String,
  default: ""
}
});

module.exports = mongoose.model("SupportTicket", supportTicketSchema);