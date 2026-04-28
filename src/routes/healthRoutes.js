const express = require("express");
const { successResponse } = require("../utils/apiResponse");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(
    successResponse("DocuGenie backend is healthy.", {
      service: "docugenie-backend",
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Number(process.uptime().toFixed(2)),
    })
  );
});

module.exports = router;

