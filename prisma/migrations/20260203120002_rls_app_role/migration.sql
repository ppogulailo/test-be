-- Create a role that does NOT bypass RLS. The app and verification script use this role so RLS is enforced.
-- Migrations must be run as the table owner (e.g. the user in DATABASE_URL that created the tables).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ferdge_app') THEN
    CREATE ROLE ferdge_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS LOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO ferdge_app;
GRANT SELECT ON "Company" TO ferdge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Job" TO ferdge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Application" TO ferdge_app;
GRANT SELECT ON job_assignments TO ferdge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ferdge_app;
