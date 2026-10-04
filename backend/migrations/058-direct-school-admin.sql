BEGIN;
ALTER TABLE identity.users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
INSERT INTO platform.operator_grants(user_id,action_code,valid_from,valid_until)
 SELECT g.user_id,'platform.admins.create_direct',g.valid_from,g.valid_until FROM platform.operator_grants g
 JOIN identity.users u ON u.id=g.user_id AND u.status='ACTIVE'
 WHERE g.action_code='platform.admins.manage' AND g.revoked_at IS NULL AND g.valid_from<=now()
 AND (g.valid_until IS NULL OR g.valid_until>now())
 AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['platform.admins.manage','platform.audit','platform.operations','platform.read','platform.schools.manage','platform.schools.read','platform.settings','platform.support','platform.mail.manage']) a
  WHERE NOT EXISTS(SELECT 1 FROM platform.operator_grants p WHERE p.user_id=g.user_id AND p.action_code=a
   AND p.revoked_at IS NULL AND p.valid_from<=now() AND (p.valid_until IS NULL OR p.valid_until>now())))
 AND NOT EXISTS(SELECT 1 FROM platform.operator_grants p WHERE p.user_id=g.user_id AND p.action_code='platform.admins.create_direct' AND p.revoked_at IS NULL);
COMMIT;
