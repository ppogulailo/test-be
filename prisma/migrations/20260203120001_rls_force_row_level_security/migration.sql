-- FORCE ROW LEVEL SECURITY so the table owner is also subject to RLS (no bypass by owner).

ALTER TABLE "Job" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Application" FORCE ROW LEVEL SECURITY;
