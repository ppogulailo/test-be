-- When app.current_org_id is not set, current_setting('app.current_org_id', true) returns '' (empty string).
-- Casting ''::integer throws. Use NULLIF so unset becomes NULL and the comparison yields no rows.

DROP POLICY IF EXISTS "Job_select_org" ON "Job";
DROP POLICY IF EXISTS "Job_insert_org" ON "Job";
DROP POLICY IF EXISTS "Job_update_org" ON "Job";
DROP POLICY IF EXISTS "Job_delete_org" ON "Job";

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

DROP POLICY IF EXISTS "Application_select_org" ON "Application";
DROP POLICY IF EXISTS "Application_insert_org" ON "Application";
DROP POLICY IF EXISTS "Application_update_org" ON "Application";
DROP POLICY IF EXISTS "Application_delete_org" ON "Application";

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
