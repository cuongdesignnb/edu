BEGIN;
-- Keep immutable child targets, but an old-class plan cannot cross enrollment dates.
CREATE FUNCTION app.parent_dated_item_visible(s uuid,st uuid,yr uuid,section_name text,pub uuid,on_date date) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF section_name NOT IN ('attendance','timetable','duties') OR on_date IS NULL
   OR NOT app.parent_item_visible(s,st,yr,section_name,pub) THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM app.publication_revisions p
   JOIN app.academic_years y ON y.school_id=p.school_id AND y.id=p.year_id
   WHERE p.school_id=s AND p.id=pub AND p.year_id=yr AND p.status='PUBLISHED'
     AND p.kind=CASE section_name WHEN 'attendance' THEN 'ATTENDANCE' WHEN 'timetable' THEN 'TIMETABLE' ELSE 'DUTY' END
     AND y.starts_on<=on_date AND on_date<y.ends_on
     AND EXISTS(SELECT 1 FROM app.parent_publication_items item
       WHERE item.school_id=s AND item.student_id=st AND item.year_id=yr AND item.section=section_name AND item.publication_id=pub)
     AND EXISTS(SELECT 1 FROM app.enrollments e
       WHERE e.school_id=s AND e.student_id=st AND e.year_id=yr AND e.class_id=p.class_id
         AND e.status<>'CANCELLED' AND e.starts_on<=on_date AND (e.ends_on IS NULL OR on_date<e.ends_on)));
END $$;
REVOKE ALL ON FUNCTION app.parent_dated_item_visible(uuid,uuid,uuid,text,uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_dated_item_visible(uuid,uuid,uuid,text,uuid,date) TO edu_parent,edu_app,edu_worker;
COMMIT;
