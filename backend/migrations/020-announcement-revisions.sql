BEGIN;
ALTER TABLE app.announcements ADD COLUMN root_id uuid;
UPDATE app.announcements SET root_id=id;
ALTER TABLE app.announcements ALTER COLUMN root_id SET NOT NULL;
ALTER TABLE app.announcements ADD CONSTRAINT announcement_root FOREIGN KEY(school_id,root_id) REFERENCES app.announcements(school_id,id);
ALTER TABLE app.announcements ADD COLUMN data_version integer NOT NULL DEFAULT 1 CHECK(data_version>0);
ALTER TABLE app.announcements ADD COLUMN summary text NOT NULL DEFAULT '';
ALTER TABLE app.announcements ADD COLUMN audience text NOT NULL DEFAULT 'ALL' CHECK(audience IN ('FAMILIES','STAFF','ALL'));
ALTER TABLE app.announcements ADD COLUMN internal_note text;
ALTER TABLE app.announcements ADD COLUMN discarded_at timestamptz;
CREATE UNIQUE INDEX announcement_one_draft ON app.announcements(school_id,root_id) WHERE status IN ('DRAFT','SCHEDULED') AND discarded_at IS NULL;
ALTER TABLE app.publication_revisions ADD COLUMN public_payload jsonb;
ALTER TABLE app.publication_revisions ADD COLUMN announcement_root_id uuid;
ALTER TABLE app.publication_revisions DISABLE TRIGGER guard_publication_content;
UPDATE app.publication_revisions p SET announcement_root_id=a.root_id FROM app.announcements a WHERE a.school_id=p.school_id AND a.id=p.announcement_id;
ALTER TABLE app.publication_revisions ENABLE TRIGGER guard_publication_content;
ALTER TABLE app.publication_revisions ADD CONSTRAINT publication_announcement_root FOREIGN KEY(school_id,announcement_root_id) REFERENCES app.announcements(school_id,id);
CREATE UNIQUE INDEX announcement_current_publication ON app.publication_revisions(school_id,announcement_root_id) WHERE status='PUBLISHED' AND kind='ANNOUNCEMENT';
CREATE FUNCTION app.bind_announcement_publication_root() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='ANNOUNCEMENT' THEN SELECT root_id INTO NEW.announcement_root_id FROM app.announcements WHERE school_id=NEW.school_id AND id=NEW.announcement_id;
 ELSE NEW.announcement_root_id=NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_announcement_publication_root BEFORE INSERT ON app.publication_revisions FOR EACH ROW EXECUTE FUNCTION app.bind_announcement_publication_root();
CREATE FUNCTION app.guard_announcement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Announcement history retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.school_id,NEW.year_id,NEW.class_id,NEW.root_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.school_id,OLD.year_id,OLD.class_id,OLD.root_id,OLD.created_by,OLD.created_at)
   THEN RAISE EXCEPTION 'Announcement identity immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status IN ('PUBLISHED','WITHDRAWN') AND ((to_jsonb(NEW)-ARRAY['status','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at']) OR NEW.status NOT IN ('PUBLISHED','WITHDRAWN'))
   THEN RAISE EXCEPTION 'Published announcement immutable; create new draft' USING ERRCODE='23514'; END IF;
  IF OLD.discarded_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Discarded draft retained' USING ERRCODE='23514'; END IF;
  IF (NEW.title,NEW.sanitized_html,NEW.summary,NEW.audience,NEW.internal_note,NEW.scheduled_at) IS DISTINCT FROM (OLD.title,OLD.sanitized_html,OLD.summary,OLD.audience,OLD.internal_note,OLD.scheduled_at) THEN NEW.data_version=OLD.data_version+1; END IF;
 END IF;
 IF NEW.status='SCHEDULED' AND NEW.scheduled_at IS NULL THEN RAISE EXCEPTION 'Schedule time required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_guard_announcement BEFORE INSERT OR UPDATE OR DELETE ON app.announcements FOR EACH ROW EXECUTE FUNCTION app.guard_announcement();
CREATE FUNCTION app.guard_announcement_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sid uuid; aid uuid; a app.announcements;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.school_id,NEW.announcement_id) IS DISTINCT FROM (OLD.school_id,OLD.announcement_id) THEN RAISE EXCEPTION 'Announcement child identity immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN sid=OLD.school_id;aid=OLD.announcement_id; ELSE sid=NEW.school_id;aid=NEW.announcement_id; END IF;
 IF aid IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 SELECT * INTO a FROM app.announcements WHERE school_id=sid AND id=aid FOR UPDATE;
 IF a.id IS NULL OR a.status<>'DRAFT' OR a.discarded_at IS NOT NULL THEN RAISE EXCEPTION 'Announcement child source immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.school_id,NEW.announcement_id) IS DISTINCT FROM (OLD.school_id,OLD.announcement_id) THEN RAISE EXCEPTION 'Announcement child identity immutable' USING ERRCODE='23514'; END IF;
 UPDATE app.announcements SET data_version=data_version+1 WHERE school_id=sid AND id=aid;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER announcement_target_source BEFORE INSERT OR UPDATE OR DELETE ON app.announcement_targets FOR EACH ROW EXECUTE FUNCTION app.guard_announcement_child();
CREATE TRIGGER announcement_file_source BEFORE INSERT OR UPDATE OR DELETE ON app.file_links FOR EACH ROW EXECUTE FUNCTION app.guard_announcement_child();
REVOKE DELETE ON app.announcements FROM edu_app,edu_worker;
COMMIT;
