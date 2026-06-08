const express = require("express");
const router = express.Router();
const Announcement = require("../models/Announcement");
const User = require("../models/User");

// Add announcement (admin only)
router.post("/add", async (req, res) => {
  try {
    const { title, content, userId } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const newAnnouncement = new Announcement({
      title,
      content,
      createdAt: new Date(),
      createdBy: user.username
    });

    await newAnnouncement.save();

    res.json({ message: "Announcement added" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all announcements
router.get("/", async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;