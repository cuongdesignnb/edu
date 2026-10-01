BEGIN;
CREATE FUNCTION app.parent_timetable_week(s uuid,st uuid,yr uuid,week_start date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE academic app.academic_years; school platform.schools; f date; t date; result jsonb;
BEGIN
 IF week_start IS NULL OR extract(isodow FROM week_start)<>1
   OR NOT app.parent_can_read(s,st,yr,'timetable') THEN RETURN NULL; END IF;
 SELECT * INTO academic FROM app.academic_years y WHERE y.school_id=s AND y.id=yr;
 SELECT * INTO school FROM platform.schools sc WHERE sc.id=s;
 f:=greatest(week_start,academic.starts_on);t:=least(week_start+7,academic.ends_on);
 IF academic.id IS NULL OR school.id IS NULL OR t<=f THEN RETURN NULL; END IF;
 WITH own_lessons AS MATERIALIZED (
  SELECT j.item,meta.period_number,
    to_char((j.item->>'startsAt')::timestamptz AT TIME ZONE school.timezone,'HH24:MI') AS starts_local,
    to_char((j.item->>'endsAt')::timestamptz AT TIME ZONE school.timezone,'HH24:MI') AS ends_local
  FROM app.parent_publication_items p
  JOIN app.publication_revisions pub ON pub.school_id=p.school_id AND pub.id=p.publication_id AND pub.year_id=p.year_id
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.payload->'items')='array' THEN p.payload->'items' ELSE jsonb_build_array(p.payload) END) j(item)
  CROSS JOIN LATERAL (
    SELECT CASE WHEN min((snap.item->>'periodNumber')::int)=max((snap.item->>'periodNumber')::int)
      AND min((snap.item->>'periodNumber')::int)>0 THEN min((snap.item->>'periodNumber')::int) ELSE NULL END AS period_number
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(pub.staff_snapshot->'lessons')='array' THEN pub.staff_snapshot->'lessons' ELSE '[]'::jsonb END) snap(item)
    WHERE (snap.item->>'startsAt')::timestamptz=(j.item->>'startsAt')::timestamptz
      AND (snap.item->>'endsAt')::timestamptz=(j.item->>'endsAt')::timestamptz
      AND snap.item->>'status'=j.item->>'status'
  ) meta
  WHERE p.school_id=s AND p.student_id=st AND p.year_id=yr AND p.section='timetable'
    AND (j.item->>'date')::date>=f AND (j.item->>'date')::date<t
    AND app.parent_dated_item_visible(s,st,yr,'timetable',p.publication_id,(j.item->>'date')::date)
  ORDER BY j.item->>'startsAt',p.id LIMIT 1001
 ), days AS (
  SELECT d.day::date AS date,coalesce((
   SELECT jsonb_agg(event.title ORDER BY event.title,event.id) FROM app.calendar_events event
   WHERE event.school_id=s AND event.year_id=yr AND event.kind='HOLIDAY' AND event.status='PUBLISHED'
    AND event.starts_on<=d.day::date AND d.day::date<event.ends_on
    AND (event.class_id IS NULL OR EXISTS(SELECT 1 FROM app.enrollments en
      WHERE en.school_id=s AND en.student_id=st AND en.year_id=yr AND en.class_id=event.class_id
       AND en.status<>'CANCELLED' AND en.starts_on<=d.day::date AND (en.ends_on IS NULL OR d.day::date<en.ends_on)))
  ),'[]'::jsonb) AS holiday_names,coalesce((
   SELECT jsonb_agg(jsonb_build_object('date',l.item->>'date','startsAt',l.item->>'startsAt','endsAt',l.item->>'endsAt',
    'startsAtLocal',l.starts_local,'endsAtLocal',l.ends_local,'periodNumber',l.period_number,
    'subjectName',l.item->>'subjectName','teacherName',l.item->>'teacherName','roomName',l.item->>'roomName',
    'status',l.item->>'status','changeNote',l.item->>'changeNote') ORDER BY l.item->>'startsAt',l.item->>'subjectName')
   FROM own_lessons l WHERE (l.item->>'date')::date=d.day::date
  ),'[]'::jsonb) AS lessons
  FROM generate_series(f::timestamp,(t-1)::timestamp,interval '1 day') d(day)
 )
 SELECT jsonb_build_object('weekStart',week_start,'today',(now() AT TIME ZONE school.timezone)::date,'timezone',school.timezone,
  'year',jsonb_build_object('startsOn',academic.starts_on,'endsOn',academic.ends_on),
  'weekNumber',(SELECT CASE WHEN count(DISTINCT w.week_number)=1 THEN min(w.week_number) ELSE NULL END FROM app.school_weeks w WHERE w.school_id=s AND w.year_id=yr AND w.starts_on<week_start+7 AND f<w.ends_on),
  'days',coalesce(jsonb_agg(jsonb_build_object('date',days.date,'holidayNames',days.holiday_names,'lessons',days.lessons) ORDER BY days.date),'[]'::jsonb)) INTO result FROM days;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.parent_timetable_week(uuid,uuid,uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_timetable_week(uuid,uuid,uuid,date) TO edu_parent,edu_app,edu_worker;
COMMIT;
