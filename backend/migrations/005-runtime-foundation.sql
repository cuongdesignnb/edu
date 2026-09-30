BEGIN;
GRANT SELECT ON public.schema_migrations TO edu_app, edu_worker;
-- Locked content uses a separate approved adjustment transaction; every child
-- mutation invalidates expectedSourceVersion, including insert/delete.
CREATE FUNCTION app.bump_conduct_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sid uuid; pid uuid;
BEGIN
 sid := CASE WHEN TG_OP='DELETE' THEN OLD.school_id ELSE NEW.school_id END;
 pid := CASE WHEN TG_OP='DELETE' THEN OLD.period_id ELSE NEW.period_id END;
 UPDATE app.conduct_periods SET data_version=data_version+1 WHERE school_id=sid AND id=pid;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bump_conduct_source AFTER INSERT OR UPDATE OR DELETE ON app.conduct_records
FOR EACH ROW EXECUTE FUNCTION app.bump_conduct_source();
COMMIT;
