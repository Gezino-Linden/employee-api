 exports.up = (pgm) => {
  // users
  pgm.createTable("users", {
    id: "id",
    name: { type: "varchar(100)", notNull: true },
    email: { type: "varchar(255)", notNull: true, unique: true },
    password: { type: "text", notNull: true },
    role: { type: "varchar(20)", notNull: true, default: "user" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // employees
  pgm.createTable("employees", {
    id: "id",
    first_name: { type: "varchar(100)", notNull: true },
    last_name: { type: "varchar(100)", notNull: true },
    email: { type: "varchar(255)", notNull: true, unique: true },
    department: { type: "varchar(100)", notNull: true },
    position: { type: "varchar(100)", notNull: true },
    salary: { type: "numeric(12,2)", notNull: true, default: 0 },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // salary audit
  pgm.createTable("employee_salary_audit", {
    id: "id",
    employee_id: {
      type: "integer",
      notNull: true,
      references: "employees",
      onDelete: "cascade",
    },
    old_salary: { type: "numeric(12,2)", notNull: true },
    new_salary: { type: "numeric(12,2)", notNull: true },
    changed_by_user_id: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "cascade",
    },
    changed_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // Helpful indexes
  pgm.createIndex("employees", ["department"]);
  pgm.createIndex("employees", ["position"]);
  pgm.createIndex("employees", ["is_active"]);
};

exports.down = (pgm) => {
  pgm.dropTable("employee_salary_audit");
  pgm.dropTable("employees");
  pgm.dropTable("users");
};
