// src/swagger.js
const swaggerJSDoc = require("swagger-jsdoc");

const isProd = process.env.NODE_ENV === "production";

// In production (Render), set PUBLIC_BASE_URL=https://employee-api-xpno.onrender.com
// Locally, it will default to http://localhost:4000
const baseUrl = isProd
  ? process.env.PUBLIC_BASE_URL || "https://employee-api-xpno.onrender.com"
  : process.env.PUBLIC_BASE_URL || "http://localhost:4000";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Employee API",
    version: process.env.APP_VERSION || "1.0.0",
    description: `
Enterprise-ready Employee API with JWT Auth + RBAC (admin/manager/user).

**How to use Authorization in Swagger**
1) POST /auth/login to get a token
2) Click **Authorize** (top right)
3) Paste: **Bearer <token>**
`.trim(),
  },
  servers: [{ url: baseUrl, description: isProd ? "Production" : "Local" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", example: "admin@mail.com" },
          password: { type: "string", example: "123456" },
        },
      },
      LoginResponse: {
        type: "object",
        properties: {
          token: { type: "string" },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", example: "Manager One" },
          email: { type: "string", example: "manager@mail.com" },
          password: { type: "string", example: "123456" },
          role: {
            type: "string",
            description:
              "Optional. If your API allows setting a role at registration.",
            example: "manager",
          },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "Gezino Admin" },
          email: { type: "string", example: "admin@mail.com" },
          role: { type: "string", example: "admin" },
        },
      },
      Employee: {
        type: "object",
        properties: {
          id: { type: "integer", example: 3 },
          first_name: { type: "string", example: "John" },
          last_name: { type: "string", example: "Live" },
          email: { type: "string", example: "john.live99@company.com" },
          department: { type: "string", example: "IT" },
          position: { type: "string", example: "Dev" },
          salary: { type: "number", example: 36000.0 },
          is_active: { type: "boolean", example: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      PagedEmployees: {
        type: "object",
        properties: {
          page: { type: "integer", example: 1 },
          limit: { type: "integer", example: 10 },
          total: { type: "integer", example: 3 },
          totalPages: { type: "integer", example: 1 },
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/Employee" },
          },
        },
      },
      ReportSummary: {
        type: "object",
        properties: {
          totalEmployees: { type: "integer", example: 3 },
          totalSalary: { type: "number", example: 91000.0 },
          averageSalary: { type: "number", example: 30333.33 },
          version: { type: "string", example: "0ccd411-rounding" },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

const options = {
  swaggerDefinition,
  apis: [],
};

const spec = swaggerJSDoc(options);

// Clean manual paths
spec.paths = {
  "/": {
    get: {
      summary: "Root message",
      security: [],
      responses: { 200: { description: "OK" } },
    },
  },
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
        200: {
          description: "User",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/User" },
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
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
            schema: { $ref: "#/components/schemas/RegisterRequest" },
          },
        },
      },
      responses: {
        201: {
          description: "Created",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/User" },
            },
          },
        },
        400: {
          description: "Bad request",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        409: {
          description: "Email exists",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
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
            schema: { $ref: "#/components/schemas/LoginRequest" },
          },
        },
      },
      responses: {
        200: {
          description: "Token",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginResponse" },
            },
          },
        },
        401: {
          description: "Invalid credentials",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
    },
  },
  "/employees": {
    get: {
      summary: "List employees (admin/manager)",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", example: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", example: 10 },
        },
        {
          name: "search",
          in: "query",
          schema: { type: "string", example: "john" },
        },
        {
          name: "department",
          in: "query",
          schema: { type: "string", example: "IT" },
        },
        {
          name: "position",
          in: "query",
          schema: { type: "string", example: "Dev" },
        },
        {
          name: "active",
          in: "query",
          schema: { type: "boolean", example: true },
        },
      ],
      responses: {
        200: {
          description: "Paged results",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PagedEmployees" },
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        403: {
          description: "Forbidden",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
    },
    post: {
      summary: "Create employee (admin)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: [
                "first_name",
                "last_name",
                "email",
                "department",
                "position",
              ],
              properties: {
                first_name: { type: "string", example: "Soft" },
                last_name: { type: "string", example: "Delete" },
                email: { type: "string", example: "soft.delete4@company.com" },
                department: { type: "string", example: "IT" },
                position: { type: "string", example: "Dev" },
                salary: { type: "number", example: 20000.0 },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Created",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Employee" },
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        403: {
          description: "Forbidden",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
    },
  },
  "/employees/{id}": {
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "integer" } },
    ],
    get: {
      summary: "Get employee by id (admin/manager)",
      responses: {
        200: {
          description: "Employee",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Employee" },
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        403: {
          description: "Forbidden",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        404: {
          description: "Not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
    },
    put: {
      summary: "Update employee (admin)",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: {
        200: {
          description: "Updated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Employee" },
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        403: {
          description: "Forbidden",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
    },
    delete: {
      summary: "Soft delete employee (admin)",
      responses: {
        204: { description: "No Content" },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        403: {
          description: "Forbidden",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
    },
  },
  "/employees/{id}/restore": {
    patch: {
      summary: "Restore employee (admin)",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "integer" } },
      ],
      responses: {
        200: {
          description: "Restored",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Employee" },
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        403: {
          description: "Forbidden",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
    },
  },
  "/employees/{id}/salary": {
    patch: {
      summary: "Update salary with audit log (admin)",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "integer" } },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["salary"],
              properties: { salary: { type: "number", example: 36000.0 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Updated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Employee" },
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        403: {
          description: "Forbidden",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
    },
  },
  "/reports/summary": {
    get: {
      summary: "Salary + employee summary (admin/manager)",
      responses: {
        200: {
          description: "Summary",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReportSummary" },
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        403: {
          description: "Forbidden",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
    },
  },
};

module.exports = spec;
