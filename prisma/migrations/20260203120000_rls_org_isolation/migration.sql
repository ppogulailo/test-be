-- Milestone 2B: Row-Level Security for org isolation.
-- app.current_org_id must be set per request/transaction via set_config('app.current_org_id', <id>, true).
-- When not set, policies deny all rows (current_setting returns NULL).

-- Job: org-scoped by companyId
ALTER TABLE "Job" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Job_select_org" ON "Job"
  FOR SELECT
  USING ("companyId" = (current_setting('app.current_org_id', true))::integer);

CREATE POLICY "Job_insert_org" ON "Job"
  FOR INSERT
  WITH CHECK ("companyId" = (current_setting('app.current_org_id', true))::integer);

CREATE POLICY "Job_update_org" ON "Job"
  FOR UPDATE
  USING ("companyId" = (current_setting('app.current_org_id', true))::integer)
  WITH CHECK ("companyId" = (current_setting('app.current_org_id', true))::integer);

CREATE POLICY "Job_delete_org" ON "Job"
  FOR DELETE
  USING ("companyId" = (current_setting('app.current_org_id', true))::integer);

-- Application: org-scoped by companyId
ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Application_select_org" ON "Application"
  FOR SELECT
  USING ("companyId" = (current_setting('app.current_org_id', true))::integer);

CREATE POLICY "Application_insert_org" ON "Application"
  FOR INSERT
  WITH CHECK ("companyId" = (current_setting('app.current_org_id', true))::integer);

CREATE POLICY "Application_update_org" ON "Application"
  FOR UPDATE
  USING ("companyId" = (current_setting('app.current_org_id', true))::integer)
  WITH CHECK ("companyId" = (current_setting('app.current_org_id', true))::integer);

CREATE POLICY "Application_delete_org" ON "Application"
  FOR DELETE
  USING ("companyId" = (current_setting('app.current_org_id', true))::integer);
