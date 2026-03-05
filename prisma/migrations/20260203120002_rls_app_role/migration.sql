-- Create a role that does NOT bypass RLS. The app and verification script use this role so RLS is enforced.
-- Migrations must be run as the table owner (e.g. the user in DATABASE_URL that created the tables).
-- On managed Postgres (e.g. Fly.io), the app user often lacks CREATEROLE; this migration skips role creation
-- and GRANTs in that case so deploy succeeds. The app then connects as the same user; ensure that user
-- has NOBYPASSRLS if you need RLS in production, or rely on app-layer org isolation.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ferdge_app') THEN
    CREATE ROLE ferdge_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS LOGIN;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN NULL;  -- managed DB (e.g. Fly): cannot create roles
  WHEN duplicate_object THEN NULL;        -- role created between check and create
END
$$;

-- Only grant if the role exists (we may have skipped creation on managed DB).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ferdge_app') THEN
    GRANT USAGE ON SCHEMA public TO ferdge_app;
    -- Company model is mapped to `companies` table (see schema @@map("companies"))
    GRANT SELECT ON companies TO ferdge_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Job" TO ferdge_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Application" TO ferdge_app;
    GRANT SELECT ON job_assignments TO ferdge_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ferdge_app;
  END IF;
END
$$;
