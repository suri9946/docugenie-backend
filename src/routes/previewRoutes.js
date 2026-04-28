const express = require("express");
const { successResponse } = require("../utils/apiResponse");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(
    successResponse("Preview route placeholder.", {
      isLocked: true,
      message:
        "This route is reserved for the locked preview/unlock flow. The frontend can connect here later.",
      todo: [
        "Attach document lookup by ID",
        "Return partial preview content",
        "Unlock full preview after successful payment",
      ],
    })
  );
});

module.exports = router;

