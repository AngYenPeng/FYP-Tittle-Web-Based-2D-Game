const express = require("express");
const router = express.Router();
const Score = require("../models/Score");

// SAVE SCORE (game will call this)
router.post("/add", async (req, res) => {
  try {
    const { userId, username, score, time, mode } = req.body;

    const newScore = new Score({
      userId,
      username,
      score,
      time,
      mode
    });

    await newScore.save();

    res.json({ message: "Score saved" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET LEADERBOARD
router.get("/leaderboard", async (req, res) => {
  try {
    const scores = await Score.find()
      .sort({ score: -1 })
      .limit(20)
      .populate("userId", "username profilePicture");

    const leaderboard = scores.map(score => ({
      username: score.userId?.username || score.username || "Unknown",
      profilePicture: score.userId?.profilePicture || "/uploads/default-profile.png",
      score: score.score,
      time: score.time,
      mode: score.mode
    }));

    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get("/test", (req, res) => {
  res.send("Score route working");
});

module.exports = router;