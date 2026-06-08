const express = require("express");
const router = express.Router();
const SupportTicket = require("../models/SupportTicket");

router.post("/submit", async (req, res) => {
  try {
    const { username, email, message } = req.body;

    if (!username || !email || !message) {
      return res.status(400).json({ message: "Please fill in all fields" });
    }

    const ticket = new SupportTicket({
      username,
      email,
      message
    });

    await ticket.save();

    res.json({ message: "Support ticket submitted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;