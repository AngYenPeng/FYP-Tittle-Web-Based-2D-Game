const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String },
  password: { type: String, required: true },
  role: { type: String, default: "player" }, // player or admin

  resetCode: {
  type: String,
  default: null
},
resetCodeExpires: {
  type: Date,
  default: null
},

profilePicture: {
  type: String,
  default: "/uploads/default-profile.png"
},

isBanned: {
  type: Boolean,
  default: false
}

});

module.exports = mongoose.model("User", userSchema);

