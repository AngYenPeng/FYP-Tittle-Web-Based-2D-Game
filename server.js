const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

require("dotenv").config();

// middleware
app.use(cors());
app.use(express.json());

// 🔗 CONNECT TO MONGODB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch((err) => console.log(err));

// test route
app.get("/", (req, res) => {
  res.send("Backend + DB is running!");
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const authRoutes = require("./routes/auth");

app.use("/api/auth", authRoutes);

const scoreRoutes = require("./routes/score");

app.use("/api/score", scoreRoutes);

const announcementRoutes = require("./routes/announcement");

app.use("/api/announcement", announcementRoutes);

const adminRoutes = require("./routes/admin");

app.use("/api/admin", adminRoutes);

const supportRoutes = require("./routes/support");
app.use("/api/support", supportRoutes);

app.use(express.static("public"));