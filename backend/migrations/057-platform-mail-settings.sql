BEGIN;
CREATE TABLE platform.mail_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 enabled boolean NOT NULL DEFAULT false,
 host text NOT NULL DEFAULT '',
 port integer NOT NULL DEFAULT 587 CHECK(port BETWEEN 1 AND 65535),
 security text NOT NULL DEFAULT 'STARTTLS' CHECK(security IN ('STARTTLS','TLS')),
 username text NOT NULL DEFAULT '',
 from_email text NOT NULL DEFAULT '',
 from_name text NOT NULL DEFAULT '',
 encrypted_password text,
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 last_tested_at timestamptz,
 last_test_status text NOT NULL DEFAULT 'NOT_TESTED' CHECK(last_test_status IN ('NOT_TESTED','PENDING','SENT','FAILED','CANCELLED')),
 last_error_code text,
 last_test_mail_id uuid,
 CHECK(NOT enabled OR (host<>'' AND username<>'' AND from_email<>'' AND encrypted_password IS NOT NULL))
);
INSERT INTO platform.mail_settings(singleton) VALUES(true);
-- Only existing full platform operators inherit the new authority. A partial
-- support/settings grant cannot gain credential access through this migration.
INSERT INTO platform.operator_grants(user_id,action_code,valid_from,valid_until)
 SELECT g.user_id,'platform.mail.manage',g.valid_from,g.valid_until FROM platform.operator_grants g
 JOIN identity.users u ON u.id=g.user_id AND u.status='ACTIVE'
 WHERE g.action_code='platform.settings' AND g.revoked_at IS NULL AND g.valid_from<=now()
 AND (g.valid_until IS NULL OR g.valid_until>now())
 AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['platform.admins.manage','platform.audit','platform.operations','platform.read','platform.schools.manage','platform.schools.read','platform.settings','platform.support']) a
   WHERE NOT EXISTS(SELECT 1 FROM platform.operator_grants p WHERE p.user_id=g.user_id AND p.action_code=a
    AND p.revoked_at IS NULL AND p.valid_from<=now() AND (p.valid_until IS NULL OR p.valid_until>now())))
 AND NOT EXISTS(SELECT 1 FROM platform.operator_grants p WHERE p.user_id=g.user_id AND p.action_code='platform.mail.manage' AND p.revoked_at IS NULL);
ALTER TABLE platform.mail_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.mail_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY mail_manager ON platform.mail_settings TO edu_app
 USING(EXISTS(SELECT 1 FROM platform.operator_grants g JOIN identity.users u ON u.id=g.user_id AND u.status='ACTIVE'
 WHERE g.user_id=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid
 AND g.action_code='platform.mail.manage' AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())))
 WITH CHECK(EXISTS(SELECT 1 FROM platform.operator_grants g JOIN identity.users u ON u.id=g.user_id AND u.status='ACTIVE'
 WHERE g.user_id=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid
 AND g.action_code='platform.mail.manage' AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())));
CREATE POLICY mail_worker ON platform.mail_settings TO edu_worker USING(true) WITH CHECK(true);
CREATE POLICY mail_owner ON platform.mail_settings TO edu_migrator USING(true) WITH CHECK(true);
GRANT SELECT,UPDATE ON platform.mail_settings TO edu_app,edu_worker;
REVOKE ALL ON platform.mail_settings FROM PUBLIC,edu_parent;
CREATE FUNCTION platform.mail_status() RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform.operator_grants g JOIN identity.users u ON u.id=g.user_id AND u.status='ACTIVE'
  WHERE g.user_id=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid
  AND g.action_code IN ('platform.operations','platform.settings','platform.mail.manage')
  AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 RETURN (SELECT jsonb_build_object('enabled',enabled,'configured',host<>'' AND username<>'' AND from_email<>'' AND encrypted_password IS NOT NULL,
   'lastTestStatus',last_test_status,'lastTestedAt',last_tested_at,'lastErrorCode',last_error_code) FROM platform.mail_settings);
END $$;
REVOKE ALL ON FUNCTION platform.mail_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.mail_status() TO edu_app;
CREATE OR REPLACE FUNCTION identity.mail_delivery_allowed(mail_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(CASE q.template_key
 WHEN 'SMTP_TEST' THEN q.created_at>now()-interval '15 minutes' AND EXISTS(
  SELECT 1 FROM platform.mail_settings m JOIN platform.operator_grants g ON g.user_id=q.user_id
  JOIN identity.users u ON u.id=g.user_id AND u.status='ACTIVE'
  WHERE m.enabled AND m.version::text=split_part(q.dedupe_key,':',2) AND g.action_code='platform.mail.manage'
  AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()))
 WHEN 'PASSWORD_RESET' THEN EXISTS(SELECT 1 FROM identity.auth_challenges a JOIN identity.users u ON u.id=a.user_id
  WHERE a.id::text=split_part(q.dedupe_key,':',2) AND a.purpose='PASSWORD_RESET' AND a.consumed_at IS NULL AND a.expires_at>now() AND u.status='ACTIVE')
 WHEN 'STAFF_INVITATION' THEN q.school_id=app.tenant_id() AND EXISTS(
  SELECT 1 FROM app.staff_invitations i JOIN platform.schools s ON s.id=i.school_id JOIN identity.users u ON u.id=i.invited_by
  WHERE i.school_id=q.school_id AND i.id::text=split_part(q.dedupe_key,':',2) AND i.status='PENDING' AND i.expires_at>now()
  AND s.status IN ('ACTIVE','DRAFT') AND u.status='ACTIVE' AND (EXISTS(
   SELECT 1 FROM app.memberships m JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id
   JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
   JOIN app.role_permissions p ON p.school_id=r.school_id AND p.role_id=r.id AND p.action_code='member.manage'
   WHERE m.school_id=i.school_id AND m.user_id=i.invited_by AND m.status='ACTIVE' AND m.ended_at IS NULL
   AND g.scope_type='SCHOOL' AND 'SCHOOL'=ANY(p.allowed_scopes) AND g.revoked_at IS NULL AND g.valid_from<=now()
   AND (g.valid_until IS NULL OR g.valid_until>now())) OR EXISTS(
    SELECT 1 FROM platform.operator_grants g WHERE g.user_id=i.invited_by AND g.action_code='platform.admins.manage'
    AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()))))
 ELSE false END,false) FROM identity.mail_outbox q WHERE q.id=mail_id
$$;
COMMIT;
