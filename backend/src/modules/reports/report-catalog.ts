import {Database,one,type Row,type Transaction} from '../../database/database';
import {Permissions,grantAllows,type Grant} from '../../common/permissions';
import {Problem,notFound} from '../../common/problem';
import type {RequestContext} from '../../api.router';

const schoolReports=[{type:'attendance',title:'Chuyên cần theo lớp',description:'Trạng thái chuyên cần và tỷ lệ hiện diện theo nguồn được xem.'},{type:'conduct',title:'Thi đua theo tuần',description:'Bản chốt và công bố, điểm và phân bố xếp loại.'},{type:'activities',title:'Hoạt động và minh chứng',description:'Tiến độ của học sinh được giao hoạt động.'},{type:'class-progress',title:'Tiến độ vận hành lớp',description:'Phân công, chuyên cần, ghi nhận và kỳ đến hạn.'},{type:'links',title:'Sử dụng link tra cứu',description:'Link đã cấp, đang hiệu lực và đã mở; không xác nhận người mở.'}];
const classReports=[{type:'attendance',title:'Chuyên cần học sinh',description:'Nguồn chuyên cần đúng phạm vi lớp hoặc tiết bạn dạy.'},{type:'conduct',title:'Thi đua theo tuần',description:'Bản chốt và công bố theo tuần.'},{type:'activities',title:'Hoạt động của lớp',description:'Tiến độ từng học sinh được giao.'},{type:'student',title:'Báo cáo cá nhân',description:'Chuyên cần, thi đua đã công bố và hoạt động của học sinh.'}];
const can=(grants:Grant[],schoolId:string,today:string,action:string,classId?:string,subject=false)=>grants.some(g=>grantAllows(g,action,{schoolId,classId,allowSubject:subject},today));
async function catalog(tx:Transaction,schoolId:string,today:string,grants:Grant[],cls?:Row,yearId?:string){
 const selectedYear=cls?.year_id??yearId;
 const year=selectedYear?await one<Row>(tx,'SELECT * FROM app.academic_years WHERE school_id=$1 AND id=$2',[schoolId,selectedYear]):await one<Row>(tx,"SELECT * FROM app.academic_years WHERE school_id=$1 AND status='ACTIVE' ORDER BY starts_on DESC,id LIMIT 1",[schoolId]);
 if(selectedYear&&!year)notFound();
 const ref=year?String((await one<{d:string}>(tx,'SELECT greatest($1::date,least($2::date,$3::date-1))::text AS d',[year.starts_on,today,year.ends_on]))!.d):today;
 const broad=can(grants,schoolId,today,'report.read',cls?String(cls.id):undefined),subjectOnly=!!cls&&!broad;
 const reports=cls?classReports.filter(r=>!subjectOnly||['attendance','activities'].includes(r.type)):schoolReports;
 const weeks=year?(await tx.query<Row>('SELECT id,week_number,starts_on,(ends_on-1)::text AS end_date FROM app.school_weeks WHERE school_id=$1 AND year_id=$2 AND starts_on<=$3::date ORDER BY week_number DESC,id LIMIT 111',[schoolId,year.id,ref])).rows:[];
 const students=cls&&year&&!subjectOnly?(await tx.query<Row>(`SELECT s.id,s.full_name,s.student_code FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND e.status<>'CANCELLED' AND e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date) ORDER BY s.full_name,s.id LIMIT 5001`,[schoolId,cls.id,year.id,ref])).rows:[];
 const grades=!cls?(await tx.query<Row>("SELECT id,name FROM app.grade_levels WHERE school_id=$1 AND status='ACTIVE' ORDER BY sort_order,id LIMIT 201",[schoolId])).rows:[];
 if(weeks.length>110||students.length>5000||grades.length>200)throw new Problem(422,'REPORT_CATALOG_LIMIT');
 return {schoolId,yearId:year?.id??null,yearStart:year?.starts_on??null,yearEnd:year?.ends_on??null,classId:cls?.id??null,today:ref,reports,canExport:!!year&&can(grants,schoolId,today,'report.export',cls?String(cls.id):undefined,subjectOnly),hiddenCount:(cls?classReports.length:schoolReports.length)-reports.length,
  role:subjectOnly?'Bộ môn':cls&&grants.some(g=>g.role_code==='HOMEROOM'&&grantAllows(g,'report.read',{schoolId,classId:String(cls.id)},today))?'Chủ nhiệm':'Nhà trường',students:students.map(s=>({id:s.id,fullName:s.full_name,code:s.student_code})),weeks:weeks.map(w=>({id:w.id,index:w.week_number,startDate:w.starts_on,endDate:w.end_date})),grades:grades.map(g=>({id:g.id,name:g.name}))};
}
export async function reportCatalog(db:Database,policy:Permissions,c:RequestContext){
 return db.transaction(async tx=>{
  const schoolCatalog=c.operation.id==='getSchoolReportCatalog',yearId=c.query.yearId;
  if(Object.keys(c.query).some(k=>!schoolCatalog||k!=='yearId')||yearId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(yearId))throw new Problem(422,'INVALID_QUERY');const schoolId=c.params.schoolId!;
  if(c.operation.id==='getTeacherReportCatalog'){
   const access=await policy.require(tx,c.principal!,'teacher.self',{schoolId,allowScopedContext:true,allowSubject:true}),ids=access.grants.filter(g=>g.class_id&&g.assignment_id&&grantAllows(g,'teacher.self',{schoolId,classId:g.class_id,allowSubject:true},access.today)&&grantAllows(g,'report.read',{schoolId,classId:g.class_id,allowSubject:true},access.today)).map(g=>g.assignment_id!);
   const rows=(await tx.query<Row>(`SELECT DISTINCT c.* FROM app.teaching_assignments a JOIN app.classes c ON c.school_id=a.school_id AND c.id=a.class_id WHERE a.school_id=$1 AND a.id=ANY($2::uuid[]) AND a.revoked_at IS NULL ORDER BY c.name,c.id LIMIT 501`,[schoolId,ids])).rows;
   if(rows.length>500)throw new Problem(422,'REPORT_CATALOG_LIMIT');const classes=[];
   for(const cls of rows){const v=await catalog(tx,schoolId,access.today,access.grants,cls);classes.push({classId:cls.id,yearId:cls.year_id,className:cls.name,role:v.role,canExport:v.canExport,reports:v.reports});}return {data:{schoolId,classes}};
  }
  const cls=c.params.classId?await one<Row>(tx,'SELECT * FROM app.classes WHERE school_id=$1 AND id=$2 AND year_id=$3',[schoolId,c.params.classId,c.params.yearId]):undefined;
  if(c.params.classId&&!cls)notFound();const access=await policy.require(tx,c.principal!,'report.read',{schoolId,...(cls?{classId:String(cls.id),yearId:String(cls.year_id),allowSubject:true}:{})});
  return {data:await catalog(tx,schoolId,access.today,access.grants,cls,yearId)};
 },{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});
}
