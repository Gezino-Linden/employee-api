// migrations/002_multi_company.js
// Adds multi-company support + backfills existing rows safely (re-runnable)

exports.up = async (pgm) => {
  // 1) companies table (safe)
  pgm.createTable(
    "companies",
    {
      id: "id",
      name: { type: "varchar(150)", notNull: true },
      slug: { type: "varchar(80)", notNull: true, unique: true },
      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
    },
    { ifNotExists: true }
  );

  // 2) create default company if missing
  pgm.sql(`
    INSERT INTO companies (name, slug)
    VALUES ('Default Company', 'default')
    ON CONFLICT (slug) DO NOTHING;
  `);

  // 3) Add company_id columns if missing + backfill existing rows (safe)
  pgm.sql(`
    DO $$
    DECLARE
      default_company_id int;
    BEGIN
      SELECT id INTO default_company_id FROM public.companies WHERE slug='default';

      -- users.company_id
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='users' AND column_name='company_id'
      ) THEN
        ALTER TABLE public.users ADD COLUMN company_id int;
      END IF;

      -- employees.company_id
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='employees' AND column_name='company_id'
      ) THEN
        ALTER TABLE public.employees ADD COLUMN company_id int;
      END IF;

      -- employee_salary_audit.company_id (only if the table exists)
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='employee_salary_audit'
      ) THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='employee_salary_audit' AND column_name='company_id'
        ) THEN
          ALTER TABLE public.employee_salary_audit ADD COLUMN company_id int;
        END IF;
      END IF;

      -- backfill existing rows
      UPDATE public.users SET company_id = default_company_id WHERE company_id IS NULL;
      UPDATE public.employees SET company_id = default_company_id WHERE company_id IS NULL;

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='employee_salary_audit'
      ) THEN
        UPDATE public.employee_salary_audit
          SET company_id = default_company_id
          WHERE company_id IS NULL;
      END IF;
    END $$;
  `);

  // 4) Make columns NOT NULL (only if they exist)
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='users' AND column_name='company_id'
      ) THEN
        ALTER TABLE public.users
          ALTER COLUMN company_id SET NOT NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='employees' AND column_name='company_id'
      ) THEN
        ALTER TABLE public.employees
          ALTER COLUMN company_id SET NOT NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='employee_salary_audit'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='employee_salary_audit' AND column_name='company_id'
      ) THEN
        ALTER TABLE public.employee_salary_audit
          ALTER COLUMN company_id SET NOT NULL;
      END IF;
    END $$;
  `);

  // 5) Add FK constraints safely (won't crash if re-run)
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_company_fk') THEN
        ALTER TABLE public.users
          ADD CONSTRAINT users_company_fk
          FOREIGN KEY (company_id) REFERENCES public.companies(id)
          ON DELETE CASCADE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_company_fk') THEN
        ALTER TABLE public.employees
          ADD CONSTRAINT employees_company_fk
          FOREIGN KEY (company_id) REFERENCES public.companies(id)
          ON DELETE CASCADE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='employee_salary_audit'
      ) THEN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_company_fk') THEN
          ALTER TABLE public.employee_salary_audit
            ADD CONSTRAINT audit_company_fk
            FOREIGN KEY (company_id) REFERENCES public.companies(id)
            ON DELETE CASCADE;
        END IF;
      END IF;
    END $$;
  `);

  // 6) Indexes (safe)
  pgm.createIndex("users", "company_id", { ifNotExists: true });
  pgm.createIndex("employees", "company_id", { ifNotExists: true });

  // Only create this index if the table exists
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='employee_salary_audit'
      ) THEN
        CREATE INDEX IF NOT EXISTS employee_salary_audit_company_id_index
          ON public.employee_salary_audit (company_id);
      END IF;
    END $$;
  `);
};

exports.down = async (pgm) => {
  // Drop constraints + columns safely
  pgm.sql(`
    DO $$
    BEGIN
      -- audit table (if exists)
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='employee_salary_audit'
      ) THEN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='audit_company_fk') THEN
          ALTER TABLE public.employee_salary_audit DROP CONSTRAINT audit_company_fk;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='employee_salary_audit' AND column_name='company_id'
        ) THEN
          ALTER TABLE public.employee_salary_audit DROP COLUMN company_id;
        END IF;
      END IF;

      -- employees
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_company_fk') THEN
        ALTER TABLE public.employees DROP CONSTRAINT employees_company_fk;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='employees' AND column_name='company_id'
      ) THEN
        ALTER TABLE public.employees DROP COLUMN company_id;
      END IF;

      -- users
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_company_fk') THEN
        ALTER TABLE public.users DROP CONSTRAINT users_company_fk;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='users' AND column_name='company_id'
      ) THEN
        ALTER TABLE public.users DROP COLUMN company_id;
      END IF;
    END $$;
  `);

  // Finally drop companies table
  pgm.dropTable("companies", { ifExists: true, cascade: true });
};
