BEGIN;
-- A parent receives only published holiday labels for this child/year/day.
-- The function has no authority without the current exact parent session scope.
CREATE FUNCTION app.parent_attendance_calendar(s uuid,st uuid,yr uuid,f date,t date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF f IS NULL OR t IS NULL OR t<=f OR t-f>31 OR NOT app.parent_can_read(s,st,yr,'attendance') THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.academic_years y WHERE y.school_id=s AND y.id=yr AND f>=y.starts_on AND t<=y.ends_on) THEN RETURN NULL; END IF;
 SELECT jsonb_agg(jsonb_build_object('date',d.day::date,'holidayNames',coalesce((
   SELECT jsonb_agg(e.title ORDER BY e.title,e.id) FROM app.calendar_events e
   WHERE e.school_id=s AND e.year_id=yr AND e.kind='HOLIDAY' AND e.status='PUBLISHED'
     AND e.starts_on<=d.day::date AND e.ends_on>d.day::date
     AND (e.class_id IS NULL OR EXISTS(SELECT 1 FROM app.enrollments en
       WHERE en.school_id=s AND en.student_id=st AND en.year_id=yr AND en.class_id=e.class_id
         AND en.status<>'CANCELLED' AND en.starts_on<=d.day::date AND (en.ends_on IS NULL OR en.ends_on>d.day::date)))
 ),'[]'::jsonb)) ORDER BY d.day) INTO result
 FROM pg_catalog.generate_series(f::timestamp,(t-1)::timestamp,interval '1 day') d(day);
 RETURN coalesce(result,'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION app.parent_attendance_calendar(uuid,uuid,uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_attendance_calendar(uuid,uuid,uuid,date,date) TO edu_parent,edu_app,edu_worker;
COMMIT;
