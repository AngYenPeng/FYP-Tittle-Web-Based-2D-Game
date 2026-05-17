const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require("path");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

     const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Please fill in all fields" });
    }

    if (!passwordRegex.test(password)) {
  return res.status(400).json({
    message: "Password must be at least 6 characters and include letters and numbers"
  });
}

    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      return res.status(400).json({ message: "Username or email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    if (otpStore[email] != otp) {
  return res.json({
    message: "Invalid OTP"
  });
}

    const newUser = new User({
      username,
      email,
      password: hashedPassword
    });

    await newUser.save();

    delete otpStore[email];

    res.json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    let { loginInput, password } = req.body;

    if (!loginInput || !password) {
      return res.status(400).json({ message: "Please fill in all fields" });
    }

    loginInput = loginInput.trim();

    console.log("Login input received:", loginInput);

    const user = await User.findOne({
      $or: [
        { username: loginInput },
        { email: loginInput.toLowerCase() }
      ]
    });

    console.log("User found:", user ? user.username : "No user found");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isBanned) {
      return res.status(403).json({
        message: "Your account has been suspended. Please contact admin."
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Wrong password" });
    }

    res.json({
      message: "Login successful",
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/change-password", async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is wrong" });
    }

    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        message: "Password must be at least 6 characters and include letters and numbers"
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/update-profile", async (req, res) => {
  try {
    const { userId, username, email } = req.body;

    if (!userId || !username || !email) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
      _id: { $ne: userId }
    });

    if (existingUser) {
      return res.status(400).json({ message: "Username or email already exists" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { username, email },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.email) {
      return res.status(400).json({ message: "This account has no email registered" });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetCode = resetCode;
    user.resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Abyss Miner Password Reset Code",
      html: `
        <div style="font-family: Arial; padding: 20px;">
          <h2 style="color: #0ea5e9;">Abyss Miner Password Reset</h2>
          <p>Your password reset code is:</p>
          <h1 style="letter-spacing: 5px;">${resetCode}</h1>
          <p>This code will expire in <strong>10 minutes</strong>.</p>
          <p>If you did not request this, please ignore this email.</p>
        </div>
      `
    });

    res.json({
      message: "Reset code sent to your email"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/reset-password", async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.resetCode || !user.resetCodeExpires) {
      return res.status(400).json({ message: "No reset request found" });
    }

    if (user.resetCode !== resetCode) {
      return res.status(400).json({ message: "Invalid reset code" });
    }

    if (new Date() > user.resetCodeExpires) {
      return res.status(400).json({ message: "Reset code expired" });
    }

    if (!passwordRegex.test(newPassword)) {
  return res.status(400).json({
    message: "Password must be at least 6 characters and include letters and numbers"
  });
}

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetCode = null;
    user.resetCodeExpires = null;

    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/profile/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

   res.json({
  id: user._id,
  username: user.username,
  email: user.email,
  role: user.role,
  profilePicture: user.profilePicture
});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get scores for one user
router.get("/user/:userId", async (req, res) => {
  try {
    const scores = await Score.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const fs = require("fs");

router.post("/upload-profile-picture", upload.single("profilePicture"), async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🔥 DELETE OLD IMAGE (IMPORTANT)
    if (user.profilePicture && user.profilePicture !== "/uploads/default-profile.png") {
      const oldPath = path.join(__dirname, "..", "public", user.profilePicture);

      fs.unlink(oldPath, (err) => {
        if (err) {
          console.log("Old image delete failed (maybe already removed):", err.message);
        }
      });
    }

    // Save new image path
    const imagePath = "/uploads/" + req.file.filename;

    user.profilePicture = imagePath;
    await user.save();

    res.json({
      message: "Profile picture updated successfully",
      profilePicture: imagePath
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

  const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  }
});

});


let otpStore = {};

router.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  const otp = Math.floor(100000 + Math.random() * 900000);

  otpStore[email] = otp;

  try {
    await transporter.sendMail({
      from: "YOUR_EMAIL@gmail.com",
      to: email,
      subject: "Abyss Miner OTP Verification",
      text: `Your OTP is: ${otp}`
    });

    res.json({
      success: true
    });

  } catch (err) {
    console.log(err);

    res.json({
      success: false,
      message: "Failed to send OTP"
    });
  }
});

module.exports = router;