-- Force RLS so that table owner and superusers are also subject to policies.
-- Without this, the role that owns the table (or a superuser) bypasses RLS and the verification fails.

ALTER TABLE "Job" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Application" FORCE ROW LEVEL SECURITY;
