-- RLS only applies when the connection is NOT a superuser and does NOT have BYPASSRLS.
-- Create a dedicated app role that is subject to RLS. Use this role in DATABASE_URL to enforce RLS.
-- (Set password after migration: ALTER ROLE ferdge_app PASSWORD 'your_password';)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ferdge_app') THEN
    CREATE ROLE ferdge_app LOGIN NOSUPERUSER NOBYPASSRLS;
  ELSE
    ALTER ROLE ferdge_app NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO ferdge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ferdge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ferdge_app;

-- So future tables created by the migration runner also grant to ferdge_app
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ferdge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ferdge_app;
