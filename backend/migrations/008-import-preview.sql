BEGIN;
ALTER TABLE app.import_jobs ADD COLUMN source_columns jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE app.import_jobs ADD COLUMN parsed_at timestamptz;
ALTER TABLE app.import_rows ADD COLUMN source_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app.import_rows ADD COLUMN result_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX import_source_applied ON app.import_rows(school_id,business_key) WHERE status='APPLIED' AND business_key IS NOT NULL;
ALTER TABLE app.staff_invitations ADD COLUMN work_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
-- The worker can lock tenant school metadata without gaining UPDATE rights on
-- platform.schools. This function returns no metadata and uses the tenant GUC.
CREATE FUNCTION app.lock_school() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF app.tenant_id() IS NULL THEN RAISE EXCEPTION 'Tenant required' USING ERRCODE='23514'; END IF;
 PERFORM id FROM platform.schools WHERE id=app.tenant_id() FOR UPDATE;
END $$;
REVOKE ALL ON FUNCTION app.lock_school() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_school() TO edu_app,edu_worker;
COMMIT;
