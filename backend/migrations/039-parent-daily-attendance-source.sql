BEGIN;
-- PA03 is the morning/afternoon calendar. Lesson attendance has another denominator.
CREATE FUNCTION app.parent_attendance_is_daily(s uuid,st uuid,yr uuid,pub uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF pub IS NULL OR NOT app.parent_item_visible(s,st,yr,'attendance',pub) THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM app.publication_revisions p
   JOIN app.attendance_sessions a ON a.school_id=p.school_id AND a.id=p.attendance_session_id AND a.year_id=p.year_id
   WHERE p.school_id=s AND p.id=pub AND p.year_id=yr AND p.kind='ATTENDANCE' AND p.status='PUBLISHED'
     AND a.granularity='DAILY' AND EXISTS(SELECT 1 FROM app.parent_publication_items item
       WHERE item.school_id=s AND item.student_id=st AND item.year_id=yr AND item.section='attendance' AND item.publication_id=pub));
END $$;
REVOKE ALL ON FUNCTION app.parent_attendance_is_daily(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_attendance_is_daily(uuid,uuid,uuid,uuid) TO edu_parent,edu_app,edu_worker;
COMMIT;
