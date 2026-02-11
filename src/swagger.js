const swaggerJSDoc = require("swagger-jsdoc");

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Employee API",
    version: "1.0.0",
    description: "Employee API with JWT Auth + RBAC (admin/manager/user)",
  },
  servers: [
    { url: "http://localhost:4000", description: "Local" },
    {
      url: "https://employee-api-xpno.onrender.com",
      description: "Production (Render)",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  security: [{ bearerAuth: [] }],
};

const options = {
  swaggerDefinition,
  // We’re not doing JSDoc comments for every route yet; we’ll define paths manually below
  apis: [],
};

const spec = swaggerJSDoc(options);

// Minimal but useful manual paths (enterprise-friendly)
spec.paths = {
  "/health": {
    get: {
      summary: "Health check",
      security: [],
      responses: { 200: { description: "OK" } },
    },
  },
  "/me": {
    get: {
      summary: "Get current user from token",
      responses: {
        200: { description: "User object" },
        401: { description: "Unauthorized" },
      },
    },
  },
  "/auth/register": {
    post: {
      summary: "Register a user",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "email", "password"],
              properties: {
                name: { type: "string" },
                email: { type: "string" },
                password: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        201: { description: "Created" },
        409: { description: "Email exists" },
      },
    },
  },
  "/auth/login": {
    post: {
      summary: "Login (returns JWT)",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password"],
              properties: {
                email: { type: "string" },
                password: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Token" },
        401: { description: "Invalid credentials" },
      },
    },
  },
  "/employees": {
    get: {
      summary: "List employees (admin/manager)",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "limit", in: "query", schema: { type: "integer" } },
        { name: "search", in: "query", schema: { type: "string" } },
        { name: "department", in: "query", schema: { type: "string" } },
        { name: "position", in: "query", schema: { type: "string" } },
        { name: "active", in: "query", schema: { type: "boolean" } },
      ],
      responses: {
        200: { description: "Paged results" },
        403: { description: "Forbidden" },
      },
    },
    post: {
      summary: "Create employee (admin)",
      responses: {
        201: { description: "Created" },
        403: { description: "Forbidden" },
      },
    },
  },
  "/employees/{id}": {
    get: {
      summary: "Get employee by id (admin/manager)",
      responses: { 200: { description: "OK" } },
    },
    put: {
      summary: "Update employee (admin)",
      responses: { 200: { description: "OK" } },
    },
    delete: {
      summary: "Soft delete employee (admin)",
      responses: { 204: { description: "No Content" } },
    },
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "integer" } },
    ],
  },
  "/employees/{id}/restore": {
    patch: {
      summary: "Restore employee (admin)",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "integer" } },
      ],
      responses: {
        200: { description: "Restored" },
        403: { description: "Forbidden" },
      },
    },
  },
  "/employees/{id}/salary": {
    patch: {
      summary: "Update salary with audit log (admin)",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "integer" } },
      ],
      responses: {
        200: { description: "Updated" },
        403: { description: "Forbidden" },
      },
    },
  },
  "/reports/summary": {
    get: {
      summary: "Salary + employee summary (admin/manager)",
      responses: {
        200: { description: "Summary" },
        403: { description: "Forbidden" },
      },
    },
  },
};

module.exports = spec;
