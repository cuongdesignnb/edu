BEGIN;
CREATE TABLE app.conduct_publication_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES platform.schools(id) ON DELETE RESTRICT,
 publication_id uuid NOT NULL,
 source_version integer NOT NULL CHECK(source_version>0),
 approved_by uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
 approved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,publication_id),
 FOREIGN KEY(school_id,publication_id) REFERENCES app.publication_revisions(school_id,id) ON DELETE RESTRICT
);
ALTER TABLE app.conduct_publication_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conduct_publication_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_approvals ON app.conduct_publication_approvals TO edu_app,edu_migrator
 USING(school_id=app.tenant_id()) WITH CHECK(school_id=app.tenant_id());
GRANT SELECT,INSERT ON app.conduct_publication_approvals TO edu_app;
GRANT SELECT ON app.conduct_publication_approvals TO edu_migrator;
CREATE FUNCTION app.school_conduct_approver(sid uuid,uid uuid,action_name text DEFAULT 'conduct.review') RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
  JOIN platform.schools sc ON sc.id=m.school_id AND sc.status='ACTIVE'
  JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id AND g.scope_type='SCHOOL'
  JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
  JOIN app.role_permissions rp ON rp.school_id=r.school_id AND rp.role_id=r.id AND g.scope_type=ANY(rp.allowed_scopes)
  WHERE m.school_id=sid AND m.user_id=uid AND m.status='ACTIVE' AND m.ended_at IS NULL
  AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
  AND rp.action_code=action_name)
$$;
REVOKE ALL ON FUNCTION app.school_conduct_approver(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.school_conduct_approver(uuid,uuid,text) TO edu_app,edu_worker;
CREATE FUNCTION app.guard_conduct_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Conduct approval retained' USING ERRCODE='23514'; END IF;
 IF NEW.approved_by IS DISTINCT FROM NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid
  OR NOT app.school_conduct_approver(NEW.school_id,NEW.approved_by)
  OR NOT EXISTS(SELECT 1 FROM app.publication_revisions p JOIN app.conduct_periods cp ON cp.school_id=p.school_id AND cp.id=p.conduct_period_id
   WHERE p.school_id=NEW.school_id AND p.id=NEW.publication_id AND p.kind='CONDUCT' AND p.status='READY'
   AND p.source_version=NEW.source_version AND cp.status='LOCKED' AND cp.data_version=NEW.source_version)
 THEN RAISE EXCEPTION 'Current locked source and school approver required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_conduct_approval BEFORE INSERT OR UPDATE OR DELETE ON app.conduct_publication_approvals
 FOR EACH ROW EXECUTE FUNCTION app.guard_conduct_approval();
CREATE FUNCTION app.guard_conduct_leader_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind<>'CONDUCT' OR NEW.status<>'PUBLISHED' OR (TG_OP='UPDATE' AND OLD.status='PUBLISHED')
  OR NOT EXISTS(SELECT 1 FROM platform.schools sc WHERE sc.id=NEW.school_id AND sc.settings->>'conductRequireLeaderApproval'='true') THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.conduct_publication_approvals a WHERE a.school_id=NEW.school_id AND a.publication_id=NEW.id AND a.source_version=NEW.source_version)
  AND NOT EXISTS(SELECT 1 FROM app.adjustment_requests a WHERE a.school_id=NEW.school_id AND a.period_id=NEW.conduct_period_id
   AND a.id=NULLIF(current_setting('app.adjustment_id',true),'')::uuid AND a.status='APPROVED'
   AND app.school_conduct_approver(a.school_id,a.decided_by,'conduct.adjust.approve'))
 THEN RAISE EXCEPTION 'Leader approval required for current conduct source' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_conduct_leader_publication BEFORE INSERT OR UPDATE ON app.publication_revisions
 FOR EACH ROW EXECUTE FUNCTION app.guard_conduct_leader_publication();
REVOKE ALL ON FUNCTION app.guard_conduct_approval(),app.guard_conduct_leader_publication() FROM PUBLIC;
COMMIT;
