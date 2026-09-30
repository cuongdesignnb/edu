BEGIN;
ALTER TABLE platform.support_access ADD CONSTRAINT support_access_tenant_identity UNIQUE(school_id,id);
ALTER TABLE app.audit_events ADD COLUMN support_access_id uuid,
 ADD CONSTRAINT audit_support_same_school FOREIGN KEY(school_id,support_access_id) REFERENCES platform.support_access(school_id,id);
CREATE INDEX audit_support_access ON app.audit_events(school_id,support_access_id,created_at,id) WHERE support_access_id IS NOT NULL;
COMMIT;
