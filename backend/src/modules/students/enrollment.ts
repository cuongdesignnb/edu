import { one,type Transaction,type Row } from '../../database/database';
import { getResource,insertResource,resource } from '../../database/resources';
import { Problem,validation } from '../../common/problem';

// Caller locks the school first, then students/classes in stable ID order.
// Capacity is the peak simultaneous occupancy, rather than the number of
// people who attended at any point in the proposed interval.
export async function checkCapacity(tx:Transaction,schoolId:string,cls:Row,starts:string,ends:string,additional=1){
  const peak=await one<{peak:string}>(tx,`WITH spans AS (
    SELECT greatest(starts_on,$3::date) AS a,least(coalesce(ends_on,$4::date),$4::date) AS b
    FROM app.enrollments WHERE school_id=$1 AND class_id=$2 AND status<>'CANCELLED'
    AND daterange(starts_on,ends_on,'[)')&&daterange($3::date,$4::date,'[)')
  ),events AS (SELECT a AS day,1 AS delta FROM spans UNION ALL SELECT b,-1 FROM spans),
  daily AS (SELECT day,sum(delta) AS delta FROM events GROUP BY day),
  occupancy AS (SELECT sum(delta) OVER(ORDER BY day) AS n FROM daily)
  SELECT coalesce(max(n),0)::text AS peak FROM occupancy`,[schoolId,cls.id,starts,ends]);
  if(Number(peak!.peak)+additional>Number(cls.capacity))throw new Problem(422,'CLASS_CAPACITY_EXCEEDED');
}
export async function placeEnrollment(tx:Transaction,schoolId:string,studentId:string,classId:string,starts:string,ends?:string){
  await getResource(tx,resource('student'),schoolId,studentId,true);
  const cls=await getResource(tx,resource('class'),schoolId,classId,true),year=await getResource(tx,resource('year'),schoolId,String(cls.year_id),true);
  const until=ends??String(year.ends_on);
  if(cls.status==='ARCHIVED'||year.status==='ARCHIVED')throw new Problem(409,'YEAR_ARCHIVED');
  if(starts<String(year.starts_on)||starts>=until||until>String(year.ends_on))validation('startsOn','Ngoài phạm vi năm học');
  await checkCapacity(tx,schoolId,cls,starts,until);
  return insertResource(tx,resource('enrollment'),schoolId,{studentId,classId,yearId:cls.year_id,startsOn:starts,endsOn:until});
}
