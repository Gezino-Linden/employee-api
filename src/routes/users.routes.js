const express = require("express");
const router = express.Router();

const usersController = require("../controllers/users.controller");
const { requireAuth, requireRoles } = require("../middleware");

/**
 * Users permissions:
 * - admin: can update roles + delete users
 * - authenticated: can list/view/create/update (your choice)
 */

// Basic CRUD
router.get("/", requireAuth, usersController.getUsers);
router.get("/:id", requireAuth, usersController.getUserById);
router.post("/", requireAuth, usersController.createUser);
router.put("/:id", requireAuth, usersController.updateUser);

// Admin-only actions
router.delete(
  "/:id",
  requireAuth,
  requireRoles("admin"),
  usersController.deleteUser
);

router.patch(
  "/:id/role",
  requireAuth,
  requireRoles("admin"),
  usersController.updateUserRole
);

module.exports = router;
