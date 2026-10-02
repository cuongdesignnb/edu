import {Permissions,grantAllows} from '../../common/permissions';
import {one,type Row,type Transaction} from '../../database/database';
import {Problem} from '../../common/problem';
import type {RequestContext} from '../../api.router';

export const importKinds=[
 {kind:'students',apiKind:'STUDENTS',title:'Học sinh',action:'student.manage',description:'Thêm hoặc cập nhật theo mã học sinh; quan hệ giám hộ mới cần xác minh riêng.',required:['studentCode','fullName'],fields:['studentCode','fullName','dateOfBirth','gender','preferredName','classCode','startsOn','guardianName','guardianPhone','guardianEmail','relationshipLabel']},
 {kind:'teachers',apiKind:'STAFF',title:'Giáo viên',action:'member.manage',description:'Thêm lời mời có vai trò và thời hạn, hoặc cập nhật hồ sơ công tác theo mã/email đã đối chiếu.',required:['staffCode','email','workDisplayName'],fields:['email','staffCode','workDisplayName','workPhone','department','roleCode','classCode','subjectCode','startsOn','endsOn','reason']},
 {kind:'classes',apiKind:'CLASSES',title:'Lớp',action:'class.manage',description:'Tạo hoặc cập nhật lớp trong năm đã chọn; giữ học sinh và lịch sử hiện có.',required:['code','name','gradeCode'],fields:['code','name','gradeCode','capacity']},
 {kind:'timetable',apiKind:'TIMETABLE',title:'Lịch học',action:'schedule.manage',description:'Tạo bản thời khóa biểu nháp của lớp; kiểm tra và công bố tại màn thời khóa biểu.',required:['weekday','slot','startsAt','endsAt','subjectCode','staffCode'],fields:['weekday','slot','startsAt','endsAt','subjectCode','staffCode','roomCode']},
] as const;
const labels:Record<string,string>={studentCode:'Mã HS',fullName:'Họ và tên',dateOfBirth:'Ngày sinh',gender:'Giới tính',preferredName:'Tên thường gọi',classCode:'Mã lớp',startsOn:'Ngày bắt đầu',guardianName:'Người giám hộ',guardianPhone:'SĐT giám hộ',guardianEmail:'Email giám hộ',relationshipLabel:'Quan hệ',staffCode:'Mã giáo viên',email:'Email',workDisplayName:'Họ và tên công tác',workPhone:'SĐT công tác',department:'Tổ chuyên môn',roleCode:'Mã vai trò',subjectCode:'Mã môn',endsOn:'Ngày kết thúc',reason:'Lý do phân công lùi ngày',code:'Mã lớp',name:'Tên lớp',gradeCode:'Mã khối',capacity:'Sức chứa',weekday:'Thứ (1=T2,7=CN)',slot:'Tiết',startsAt:'Bắt đầu HH:mm',endsAt:'Kết thúc HH:mm',roomCode:'Mã phòng'};
export async function importWorkspace(tx:Transaction,p:Permissions,c:RequestContext){
 const schoolId=c.params.schoolId!,access=await p.require(tx,c.principal!,'import.manage',{schoolId});
 if(Object.keys(c.query).length)throw new Problem(422,'INVALID_QUERY');
 const years=(await tx.query<Row>("SELECT id,name,starts_on,ends_on,status FROM app.academic_years WHERE school_id=$1 AND status<>'ARCHIVED' ORDER BY starts_on DESC LIMIT 101",[schoolId])).rows;
 const classes=(await tx.query<Row>("SELECT id,year_id,name,code,status FROM app.classes WHERE school_id=$1 AND status<>'ARCHIVED' ORDER BY name COLLATE app.vi_names,id LIMIT 5001",[schoolId])).rows;
 if(years.length>100||classes.length>5000)throw new Problem(422,'WORKSPACE_LIMIT');
 const kinds=importKinds.map(k=>({kind:k.kind,apiKind:k.apiKind,title:k.title,description:k.description,enabled:access.grants.some(g=>grantAllows(g,k.action,{schoolId},access.today)),columns:k.fields.map(key=>({key,label:labels[key]??key,required:(k.required as readonly string[]).includes(key)})),sampleRows:[]}));
 const school=(await one<Row>(tx,'SELECT timezone FROM platform.schools WHERE id=$1',[schoolId]))!;
 return {schoolId,today:access.today,timezone:school.timezone,kinds,years:years.map(y=>({id:y.id,name:y.name,startsOn:y.starts_on,endsOn:y.ends_on,status:y.status})),classes:classes.map(cl=>({id:cl.id,yearId:cl.year_id,name:cl.name,code:cl.code,status:cl.status}))};
}
