const express = require("express");
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} = require("../controllers/users.controller");

const { requireAuth, requireRole } = require("../middleware");

const router = express.Router();

router.get("/", requireAuth, getUsers);
router.get("/:id", requireAuth, getUserById);
router.post("/", requireAuth, createUser);
router.put("/:id", requireAuth, updateUser);
router.delete("/:id", requireAuth, requireRole("admin"), deleteUser);

module.exports = router;
