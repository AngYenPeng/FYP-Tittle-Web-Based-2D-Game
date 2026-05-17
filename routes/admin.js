const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Score = require("../models/Score");
const Announcement = require("../models/Announcement");
const SupportTicket = require("../models/SupportTicket");
const nodemailer = require("nodemailer");
const ActivityLog = require("../models/ActivityLog");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function addActivityLog(action, performedBy, target, details) {
  try {
    await ActivityLog.create({
      action,
      performedBy,
      target,
      details
    });
  } catch (err) {
    console.log("Activity log error:", err.message);
  }
}

async function checkAdmin(req, res, next) {
  try {
    const userId =
      req.headers.userid ||
      (req.body && req.body.userId) ||
      req.query.userId;

    if (!userId) {
      return res.status(401).json({ message: "No userId provided" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role !== "admin" && user.role !== "superadmin") {
  return res.status(403).json({ message: "Access denied. Admin only." });
}

    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Get all users
router.get("/users", checkAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ _id: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user username/email
router.put("/users/:id", checkAdmin, async (req, res) => {
  try {
    const { username, email } = req.body;

    if (!username || !email) {
      return res.status(400).json({ message: "Username and email are required" });
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
      _id: { $ne: req.params.id }
    });

    if (existingUser) {
      return res.status(400).json({ message: "Username or email already exists" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { username, email },
      { returnDocument: "after" }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User updated successfully", user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function checkAdmin(req, res, next) {
  try {
    const userId =
      req.headers.userid ||
      (req.body && req.body.userId) ||
      req.query.userId;

    if (!userId) {
      return res.status(401).json({ message: "No userId provided" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role !== "admin" && user.role !== "superadmin") {
  return res.status(403).json({ message: "Access denied. Admin only." });
}

    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Get all users
router.get("/users", checkAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ _id: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user username/email
router.put("/users/:id", checkAdmin, async (req, res) => {
  try {
    const { username, email } = req.body;

    if (!username || !email) {
      return res.status(400).json({ message: "Username and email are required" });
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
      _id: { $ne: req.params.id }
    });

    if (existingUser) {
      return res.status(400).json({ message: "Username or email already exists" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { username, email },
      { returnDocument: "after" }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User updated successfully", user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user and their scores
router.delete("/users/:id", checkAdmin, async (req, res) => {
  try {
    if (req.params.id === req.headers.userid) {
      return res.status(400).json({ message: "You cannot delete your own admin account" });
    }

    const deletedUser = await User.findByIdAndDelete(req.params.id);

    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (deletedUser.role === "superadmin") {
  return res.status(403).json({ message: "Cannot delete superadmin account" });
}

    await Score.deleteMany({ userId: req.params.id });

    res.json({ message: "User and related scores deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all scores
router.get("/scores", checkAdmin, async (req, res) => {
  try {
    const scores = await Score.find().sort({ createdAt: -1 });
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update score
router.put("/scores/:id", checkAdmin, async (req, res) => {
  try {
    const { score, time, mode } = req.body;

    const updatedScore = await Score.findByIdAndUpdate(
      req.params.id,
      {
        score: Number(score),
        time: Number(time),
        mode
      },
      { returnDocument: "after" }
    );

    if (!updatedScore) {
      return res.status(404).json({ message: "Score not found" });
    }

    res.json({ message: "Score updated successfully", score: updatedScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete score
router.delete("/scores/:id", checkAdmin, async (req, res) => {
  try {
    const deletedScore = await Score.findByIdAndDelete(req.params.id);

    if (!deletedScore) {
      return res.status(404).json({ message: "Score not found" });
    }

    res.json({ message: "Score deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all announcements
router.get("/announcements", checkAdmin, async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit announcement
router.put("/announcements/:id", checkAdmin, async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    const updatedAnnouncement = await Announcement.findByIdAndUpdate(
      req.params.id,
      {
        title,
        content,
        updatedAt: new Date()
      },
      { returnDocument: "after" }
    );

    if (!updatedAnnouncement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    res.json({ message: "Announcement updated successfully", announcement: updatedAnnouncement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete announcement
router.delete("/announcements/:id", checkAdmin, async (req, res) => {
  try {
    const deletedAnnouncement = await Announcement.findByIdAndDelete(req.params.id);

    if (!deletedAnnouncement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    res.json({ message: "Announcement deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/users/:id/role", checkAdmin, async (req, res) => {
  try {
    const currentAdminId = req.headers.userid;
    const { role } = req.body;

    const currentAdmin = await User.findById(currentAdminId);

    if (!currentAdmin || currentAdmin.role !== "superadmin") {
      return res.status(403).json({ message: "Only superadmin can change roles" });
    }

    if (!["player", "admin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (targetUser.role === "superadmin") {
      return res.status(403).json({ message: "Cannot change superadmin role" });
    }

    targetUser.role = role;
    await targetUser.save();

    res.json({ message: "User role updated successfully", user: targetUser });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
 });

module.exports = router;

// Update score
router.put("/scores/:id", checkAdmin, async (req, res) => {
  try {
    const { score, time, mode } = req.body;

    const updatedScore = await Score.findByIdAndUpdate(
      req.params.id,
      {
        score: Number(score),
        time: Number(time),
        mode
      },
      { returnDocument: "after" }
    );

    if (!updatedScore) {
      return res.status(404).json({ message: "Score not found" });
    }

    res.json({ message: "Score updated successfully", score: updatedScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete score
router.delete("/scores/:id", checkAdmin, async (req, res) => {
  try {
    const deletedScore = await Score.findByIdAndDelete(req.params.id);

    if (!deletedScore) {
      return res.status(404).json({ message: "Score not found" });
    }

    await addActivityLog(
  "DELETE_SCORE",
  req.headers.userid,
  deletedScore.username,
  "Deleted score record"
);

    res.json({ message: "Score deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all announcements
router.get("/announcements", checkAdmin, async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit announcement
router.put("/announcements/:id", checkAdmin, async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    const updatedAnnouncement = await Announcement.findByIdAndUpdate(
      req.params.id,
      {
        title,
        content,
        updatedAt: new Date()
      },
      { returnDocument: "after" }
    );

    if (!updatedAnnouncement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    res.json({ message: "Announcement updated successfully", announcement: updatedAnnouncement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete announcement
router.delete("/announcements/:id", checkAdmin, async (req, res) => {
  try {
    const deletedAnnouncement = await Announcement.findByIdAndDelete(req.params.id);

    if (!deletedAnnouncement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    res.json({ message: "Announcement deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/users/:id/role", checkAdmin, async (req, res) => {
  try {
    const currentAdminId = req.headers.userid;
    const { role } = req.body;

    const currentAdmin = await User.findById(currentAdminId);

    if (!currentAdmin || currentAdmin.role !== "superadmin") {
      return res.status(403).json({ message: "Only superadmin can change roles" });
    }

    if (!["player", "admin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (targetUser.role === "superadmin") {
      return res.status(403).json({ message: "Cannot change superadmin role" });
    }

    targetUser.role = role;
    await targetUser.save();

    await addActivityLog(
  "CHANGE_ROLE",
  req.headers.userid,
  targetUser.username,
  "Changed role to " + role
);

    res.json({ message: "User role updated successfully", user: targetUser });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/users/:id/ban", checkAdmin, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (targetUser.role === "superadmin") {
      return res.status(403).json({ message: "Cannot ban superadmin account" });
    }

    targetUser.isBanned = true;
    await targetUser.save();

    await addActivityLog(
  "BAN_USER",
  req.headers.userid,
  targetUser.username,
  "Banned user account"
);

    res.json({ message: "User banned successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/users/:id/unban", checkAdmin, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    targetUser.isBanned = false;
    await targetUser.save();

    await addActivityLog(
  "UNBAN_USER",
  req.headers.userid,
  targetUser.username,
  "Unbanned user account"
);

    res.json({ message: "User unbanned successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all support tickets
router.get("/support-tickets", checkAdmin, async (req, res) => {
  try {
    const tickets = await SupportTicket.find().sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark ticket as resolved
router.put("/support-tickets/:id/resolve", checkAdmin, async (req, res) => {
  try {
    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      { status: "resolved" },
      { returnDocument: "after" }
    );

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    res.json({ message: "Ticket marked as resolved" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/support-tickets/:id/reply", checkAdmin, async (req, res) => {
  try {
    const { reply } = req.body;

    if (!reply) {
      return res.status(400).json({ message: "Reply is required" });
    }

    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      {
        reply,
        status: "resolved"
      },
      { returnDocument: "after" }
    );

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: ticket.email,
      subject: "Abyss Miner Support Ticket Reply",
      html: `
        <div style="font-family: Arial; padding: 20px;">
          <h2 style="color:#7c3aed;">Abyss Miner Support Reply</h2>
          <p>Hello ${ticket.username},</p>
          <p>Your support ticket has been replied to:</p>
          <div style="background:#f1f5f9; padding:15px; border-radius:8px;">
            ${reply}
          </div>
          <p>Status: <strong>Resolved</strong></p>
          <p>Thank you,<br>Abyss Miner Support Team</p>
        </div>
      `

      
    });

    await addActivityLog(
  "REPLY_TICKET",
  req.headers.userid,
  ticket.username,
  "Replied support ticket"
);

    res.json({ message: "Reply sent, email delivered, and ticket resolved", ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/activity-logs", checkAdmin, async (req, res) => {
  try {
    const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(50);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;