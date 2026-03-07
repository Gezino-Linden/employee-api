// File: src/routes/users.routes.js
const express = require("express");
const router = express.Router();
const usersController = require("../controllers/users.controller");
const { requireAuth, requireRoles } = require("../middleware");

const canManage = ["owner", "admin", "general_manager", "manager"];

router.get(
  "/",
  requireAuth,
  requireRoles(...canManage),
  usersController.getUsers
);
router.get(
  "/:id",
  requireAuth,
  requireRoles(...canManage),
  usersController.getUserById
);
router.post(
  "/",
  requireAuth,
  requireRoles(...canManage),
  usersController.createUser
);
router.put(
  "/:id",
  requireAuth,
  requireRoles(...canManage),
  usersController.updateUser
);
router.delete(
  "/:id",
  requireAuth,
  requireRoles("owner", "admin"),
  usersController.deleteUser
);
router.patch(
  "/:id/role",
  requireAuth,
  requireRoles("owner", "admin"),
  usersController.updateUserRole
);

module.exports = router;
