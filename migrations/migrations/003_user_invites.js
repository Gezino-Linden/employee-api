exports.up = (pgm) => {
  pgm.createTable(
    "user_invites",
    {
      id: "id",
      company_id: {
        type: "integer",
        notNull: true,
        references: "companies",
        onDelete: "cascade",
      },
      email: { type: "varchar(255)", notNull: true },
      role: { type: "varchar(20)", notNull: true, default: "user" },
      token_hash: { type: "text", notNull: true, unique: true },
      expires_at: { type: "timestamptz", notNull: true },
      created_by_user_id: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "cascade",
      },
      used_at: { type: "timestamptz" },
      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
    },
    { ifNotExists: true }
  );

  pgm.createIndex("user_invites", ["company_id"], { ifNotExists: true });
  pgm.createIndex("user_invites", ["email"], { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropTable("user_invites", { ifExists: true });
};
