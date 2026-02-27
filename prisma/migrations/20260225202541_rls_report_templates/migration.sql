-- Enable Row Level Security on report_templates
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_templates FORCE ROW LEVEL SECURITY;

-- Org-isolation policy: only rows whose companyId matches the session variable are visible
CREATE POLICY report_templates_org_isolation ON report_templates
  USING ("companyId" = current_setting('app.current_org_id', true)::int);

-- Grant full DML to the app role
GRANT SELECT, INSERT, UPDATE, DELETE ON report_templates TO ferdge_app;
