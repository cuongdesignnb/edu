-- Bootstrap danh sách thành viên của danh tính đã xác thực.
-- Backend đặt authenticated_user_id sau kiểm tra opaque session; không lấy từ HTTP.
BEGIN;
CREATE POLICY self_membership_bootstrap ON app.memberships FOR SELECT TO edu_app
USING (
  app.tenant_id() IS NULL
  AND user_id = NULLIF(current_setting('app.authenticated_user_id', true), '')::uuid
);
-- Projection chỉ được tạo khi bản công bố còn READY.
CREATE FUNCTION app.guard_parent_projection_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pub_state text;
BEGIN
 SELECT status INTO pub_state FROM app.publication_revisions
 WHERE school_id=NEW.school_id AND id=NEW.publication_id AND year_id=NEW.year_id;
 IF pub_state IS DISTINCT FROM 'READY' THEN
  RAISE EXCEPTION 'Projection requires READY publication; create a new revision' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_projection_insert BEFORE INSERT ON app.parent_publication_items
FOR EACH ROW EXECUTE FUNCTION app.guard_parent_projection_insert();
COMMIT;
