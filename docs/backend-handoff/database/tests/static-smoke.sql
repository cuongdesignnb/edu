-- Chỉ probe cấu trúc trên DB local/test. Không phải E2E dữ liệu.
-- Chạy với psql -X -v ON_ERROR_STOP=1 -f ... sau migrations, do DBA test.
BEGIN TRANSACTION READ ONLY;
DO $$
DECLARE n int;
BEGIN
 IF current_database() !~ '_(local|test)$' THEN
  RAISE EXCEPTION 'Refuse: only *_local or *_test database';
 END IF;
 SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='app' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity;
 IF n<>60 THEN RAISE EXCEPTION 'Expected 60 FORCE RLS app tables; found %',n; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('edu_app','edu_parent','edu_worker','edu_migrator') AND (rolsuper OR rolbypassrls)) THEN
 RAISE EXCEPTION 'Runtime/migration role may bypass RLS'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('edu_app','edu_parent','edu_worker','edu_migrator')) <>4 THEN
 RAISE EXCEPTION 'Required database roles missing'; END IF;
 IF has_table_privilege('edu_parent','app.students','SELECT') THEN
 RAISE EXCEPTION 'Parent role must not SELECT raw student table'; END IF;
 IF NOT has_table_privilege('edu_parent','app.parent_publication_items','SELECT') THEN
 RAISE EXCEPTION 'Parent projection grant missing'; END IF;
 IF has_table_privilege('edu_app','app.audit_events','UPDATE') OR has_table_privilege('edu_app','app.audit_events','DELETE') THEN
 RAISE EXCEPTION 'Audit runtime write rights too broad'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polname='self_membership_bootstrap') THEN
 RAISE EXCEPTION 'Missing auth bootstrap policy'; END IF;
 RAISE NOTICE 'STRUCTURE_PROBE=PASS; data/HTTP/permissions E2E still required';
END $$;
ROLLBACK;
