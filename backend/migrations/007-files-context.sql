BEGIN;
ALTER TABLE app.files ADD COLUMN purpose text NOT NULL DEFAULT 'CLASS_DOCUMENT'
 CHECK(purpose IN ('EVIDENCE','CLASS_DOCUMENT','IMPORT','SCHOOL_LOGO','GENERATED'));
ALTER TABLE app.files ADD COLUMN upload_class_id uuid;
ALTER TABLE app.files ADD CONSTRAINT file_upload_class FOREIGN KEY(school_id,upload_class_id) REFERENCES app.classes(school_id,id);
ALTER TABLE app.files ADD COLUMN scan_status text NOT NULL DEFAULT 'NOT_SCANNED'
 CHECK(scan_status IN ('NOT_SCANNED','SCANNED','GENERATED'));
ALTER TABLE app.files ADD COLUMN rejection_code text;
CREATE INDEX file_class_idx ON app.files(school_id,upload_class_id,id);
-- Typed import context is essential to validating a preview against its year.
ALTER TABLE app.import_jobs ADD COLUMN year_id uuid;
ALTER TABLE app.import_jobs ADD COLUMN class_id uuid;
ALTER TABLE app.import_jobs ADD CONSTRAINT import_year FOREIGN KEY(school_id,year_id) REFERENCES app.academic_years(school_id,id);
ALTER TABLE app.import_jobs ADD CONSTRAINT import_class_year FOREIGN KEY(school_id,class_id,year_id) REFERENCES app.classes(school_id,id,year_id);
ALTER TABLE identity.mail_outbox ADD COLUMN delivery_mode text CHECK(delivery_mode IN ('FILE','SMTP'));
CREATE FUNCTION identity.mail_delivery_allowed(mail_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(CASE q.template_key
 WHEN 'PASSWORD_RESET' THEN EXISTS(SELECT 1 FROM identity.auth_challenges a JOIN identity.users u ON u.id=a.user_id
   WHERE a.id::text=split_part(q.dedupe_key,':',2) AND a.purpose='PASSWORD_RESET' AND a.consumed_at IS NULL
   AND a.expires_at>now() AND u.status='ACTIVE')
 WHEN 'STAFF_INVITATION' THEN q.school_id=app.tenant_id() AND EXISTS(
   SELECT 1 FROM app.staff_invitations i JOIN platform.schools s ON s.id=i.school_id
   JOIN identity.users u ON u.id=i.invited_by WHERE i.school_id=q.school_id AND i.id::text=split_part(q.dedupe_key,':',2)
   AND i.status='PENDING' AND i.expires_at>now() AND s.status IN ('ACTIVE','DRAFT') AND u.status='ACTIVE'
   AND (EXISTS(SELECT 1 FROM app.memberships m JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id
     JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
     JOIN app.role_permissions p ON p.school_id=r.school_id AND p.role_id=r.id AND p.action_code='member.manage'
     WHERE m.school_id=i.school_id AND m.user_id=i.invited_by AND m.status='ACTIVE' AND m.ended_at IS NULL
     AND g.scope_type='SCHOOL' AND 'SCHOOL'=ANY(p.allowed_scopes) AND g.revoked_at IS NULL AND g.valid_from<=now()
     AND (g.valid_until IS NULL OR g.valid_until>now()))
   OR EXISTS(SELECT 1 FROM platform.operator_grants g WHERE g.user_id=i.invited_by AND g.action_code='platform.admins.manage'
     AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())))
 ) ELSE false END,false) FROM identity.mail_outbox q WHERE q.id=mail_id
$$;
REVOKE ALL ON FUNCTION identity.mail_delivery_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.mail_delivery_allowed(uuid) TO edu_app,edu_worker;
COMMIT;
