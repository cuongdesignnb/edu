BEGIN;
CREATE TABLE app.announcement_read_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES platform.schools(id) ON DELETE RESTRICT,
 member_id uuid NOT NULL,
 publication_id uuid NOT NULL,
 read_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,member_id,publication_id),
 FOREIGN KEY(school_id,member_id) REFERENCES app.memberships(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,publication_id) REFERENCES app.publication_revisions(school_id,id) ON DELETE RESTRICT
);
ALTER TABLE app.announcement_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.announcement_read_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY own_read_receipts ON app.announcement_read_receipts TO edu_app
 USING(school_id=app.tenant_id() AND EXISTS(SELECT 1 FROM app.memberships m WHERE m.school_id=announcement_read_receipts.school_id AND m.id=announcement_read_receipts.member_id AND m.user_id=nullif(current_setting('app.authenticated_user_id',true),'')::uuid AND m.status='ACTIVE' AND m.ended_at IS NULL))
 WITH CHECK(school_id=app.tenant_id() AND EXISTS(SELECT 1 FROM app.memberships m WHERE m.school_id=announcement_read_receipts.school_id AND m.id=announcement_read_receipts.member_id AND m.user_id=nullif(current_setting('app.authenticated_user_id',true),'')::uuid AND m.status='ACTIVE' AND m.ended_at IS NULL));
CREATE POLICY migration_receipts ON app.announcement_read_receipts TO edu_migrator
 USING(school_id=app.tenant_id());
GRANT SELECT,INSERT ON app.announcement_read_receipts TO edu_app;
GRANT SELECT ON app.announcement_read_receipts TO edu_migrator;
CREATE FUNCTION app.guard_announcement_read_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Announcement read receipt immutable' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.publication_revisions p WHERE p.school_id=NEW.school_id AND p.id=NEW.publication_id AND p.kind='ANNOUNCEMENT' AND p.status='PUBLISHED') THEN
  RAISE EXCEPTION 'Read receipt requires a current announcement publication' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_announcement_read_receipt() FROM PUBLIC;
CREATE TRIGGER guard_announcement_read_receipt BEFORE INSERT OR UPDATE OR DELETE ON app.announcement_read_receipts
 FOR EACH ROW EXECUTE FUNCTION app.guard_announcement_read_receipt();
COMMIT;
