BEGIN;
ALTER TABLE app.memberships ADD COLUMN status_reason text CHECK (length(status_reason)<=2000);
COMMENT ON COLUMN app.memberships.status_reason IS 'Last explicit membership lifecycle reason; immutable audit events retain prior reasons.';
CREATE FUNCTION app.touch_school_role_member() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.scope_type='SCHOOL' THEN
  UPDATE app.memberships SET updated_at=now() WHERE school_id=OLD.school_id AND id=OLD.member_id;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.scope_type='SCHOOL' THEN
   UPDATE app.memberships SET updated_at=now() WHERE school_id=NEW.school_id AND id=NEW.member_id;
  END IF;
 ELSIF TG_OP='UPDATE' AND NEW.scope_type='SCHOOL' AND
  (OLD.scope_type<>'SCHOOL' OR OLD.member_id<>NEW.member_id OR OLD.school_id<>NEW.school_id) THEN
  UPDATE app.memberships SET updated_at=now() WHERE school_id=NEW.school_id AND id=NEW.member_id;
 END IF;
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION app.touch_school_role_member() FROM PUBLIC;
CREATE TRIGGER touch_school_role_member AFTER INSERT OR UPDATE OR DELETE ON app.role_grants
 FOR EACH ROW EXECUTE FUNCTION app.touch_school_role_member();
COMMIT;
