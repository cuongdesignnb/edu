BEGIN;
CREATE FUNCTION app.guard_adjustment_second_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status IN ('APPROVED','APPLIED') AND NEW.status IS DISTINCT FROM OLD.status
   AND EXISTS(SELECT 1 FROM platform.schools s WHERE s.id=NEW.school_id AND s.settings->>'requireSecondApprovalForAdjustment'='true')
   AND NEW.requested_by IS NOT DISTINCT FROM NEW.decided_by THEN
  RAISE EXCEPTION 'A second approver is required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_second_approval BEFORE UPDATE ON app.adjustment_requests FOR EACH ROW EXECUTE FUNCTION app.guard_adjustment_second_approval();

CREATE FUNCTION platform.guard_school_timezone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.timezone IS DISTINCT FROM OLD.timezone THEN
  IF app.tenant_id() IS DISTINCT FROM NEW.id OR EXISTS(SELECT 1 FROM app.academic_years y WHERE y.school_id=NEW.id) THEN
   RAISE EXCEPTION 'Timezone cannot change after academic years exist' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_timezone BEFORE UPDATE ON platform.schools FOR EACH ROW EXECUTE FUNCTION platform.guard_school_timezone();
COMMIT;
