BEGIN;
-- A versioned omission repair; existing system templates remain immutable in APIs.
DO $$ DECLARE school uuid; previous text := current_setting('app.school_id',true); BEGIN
 FOR school IN SELECT id FROM platform.schools ORDER BY id LOOP
  PERFORM set_config('app.school_id',school::text,true);
  INSERT INTO app.role_permissions(school_id,role_id,action_code,allowed_scopes)
   SELECT school,r.id,a,ARRAY['SCHOOL']::text[] FROM app.roles r
   CROSS JOIN unnest(ARRAY['activity.manage','activity.publish','activity.read','activity.review','announcement.manage','announcement.publish','announcement.read','assignment.manage','assignment.read','attendance.publish','attendance.read','attendance.record','attendance.reopen','audit.read','calendar.publish','class.manage','class.read','conduct.adjust.approve','conduct.adjust.request','conduct.lock','conduct.publish','conduct.read','conduct.record','conduct.review','dictionary.manage','dictionary.read','duty.manage','duty.publish','duty.read','evidence.manage','evidence.read','evidence.review','file.download','file.manage','file.read','file.upload','grant.manage','group.manage','guardian.manage','guardian.read','guardian.verify','import.manage','member.manage','member.read','parent_access.issue','parent_access.manage','parent_access.preview','parent_access.revoke','report.export','report.read','role.manage','role.read','rules.apply','rules.issue','rules.manage','rules.read','schedule.manage','schedule.publish','schedule.read','school.read','school.settings','seating.manage','student.manage','student.read','student.transfer','student.transfer.request','support.approve','support.manage','teacher.self','year.manage','year.read','publication.read','publication.withdraw','import.read','member.create_direct']::text[]) a
   WHERE r.school_id=school AND r.code='SCHOOL_ADMIN' AND r.system_role
   ON CONFLICT(school_id,role_id,action_code) DO NOTHING;
 END LOOP;
 PERFORM set_config('app.school_id',coalesce(previous,''),true);
END $$;
COMMIT;
