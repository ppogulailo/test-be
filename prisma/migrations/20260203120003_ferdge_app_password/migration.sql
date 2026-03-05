-- Set initial password for ferdge_app. Change in production (e.g. ALTER ROLE ferdge_app PASSWORD '...').
-- Only runs if ferdge_app exists (skipped on managed DBs like Fly where the role is not created).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ferdge_app') THEN
    ALTER ROLE ferdge_app PASSWORD 'ferdge_app_change_me';
  END IF;
END
$$;
