-- Set an initial password for ferdge_app so you can use it in DATABASE_URL without running psql as postgres.
-- Use DATABASE_URL="postgresql://ferdge_app:ferdge_app_change_me@localhost:5432/deveteria?schema=public"
-- Change this password in production: ALTER ROLE ferdge_app PASSWORD 'your_secure_password';

ALTER ROLE ferdge_app PASSWORD 'ferdge_app_change_me';
