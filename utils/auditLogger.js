const AuditLog = require("../models/AuditLog");

async function addAuditLog({
  action,
  req,
  user = null,
  target = "",
  status = "SUCCESS",
  details = ""
}) {

  try {

    const forwarded = req.headers["x-forwarded-for"];

    const ip =
      forwarded
        ? forwarded.split(",")[0]
        : req.socket.remoteAddress;

    await AuditLog.create({

      action,

      userId: user ? user._id : null,

      username: user ? user.username : "Unknown",

      role: user ? user.role : "guest",

      target,

      method: req.method,

      endpoint: req.originalUrl,

      ipAddress: ip,

      userAgent: req.headers["user-agent"],

      status,

      details

    });

  } catch (err) {

    console.log("Audit log error:", err.message);

  }

}

module.exports = addAuditLog;