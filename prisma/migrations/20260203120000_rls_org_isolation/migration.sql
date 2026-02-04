-- Milestone 2B: Enable RLS on org-scoped tables. Policies use app.current_org_id (set per transaction by the app).
-- When app.current_org_id is not set, current_setting('app.current_org_id', true) returns ''; NULLIF(..., '')::integer yields NULL so no rows match.

ALTER TABLE "Job" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Job_select_org" ON "Job"
  FOR SELECT
  USING ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer));

CREATE POLICY "Job_insert_org" ON "Job"
  FOR INSERT
  WITH CHECK ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer));

CREATE POLICY "Job_update_org" ON "Job"
  FOR UPDATE
  USING ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer))
  WITH CHECK ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer));

CREATE POLICY "Job_delete_org" ON "Job"
  FOR DELETE
  USING ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer));

ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Application_select_org" ON "Application"
  FOR SELECT
  USING ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer));

CREATE POLICY "Application_insert_org" ON "Application"
  FOR INSERT
  WITH CHECK ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer));

CREATE POLICY "Application_update_org" ON "Application"
  FOR UPDATE
  USING ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer))
  WITH CHECK ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer));

CREATE POLICY "Application_delete_org" ON "Application"
  FOR DELETE
  USING ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer));
