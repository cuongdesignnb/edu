import {one,type Row,type Transaction} from '../../database/database';
import {Permissions} from '../../common/permissions';
import {audit} from '../../common/commands';
import {Problem,notFound,validation} from '../../common/problem';
import {activityWorkspaceAccess} from '../activities/activity-workspace';
import {fileDto} from './files.service';
import type {RequestContext} from '../../api.router';

export async function classFilesWorkspace(tx:Transaction,policy:Permissions,c:RequestContext){
 const ctx=await activityWorkspaceAccess(tx,policy,c,'file.manage');
 const rows=(await tx.query<Row>(`SELECT f.*,m.work_display_name AS owner_name,coalesce((SELECT CASE WHEN l.student_id IS NULL THEN 'class_parents' ELSE 'student_parent' END FROM app.file_links l WHERE l.school_id=f.school_id AND l.file_id=f.id AND l.share_with_guardian AND l.announcement_id IS NULL AND l.activity_id IS NULL ORDER BY l.id LIMIT 1),'internal') AS share,(SELECT l.student_id FROM app.file_links l WHERE l.school_id=f.school_id AND l.file_id=f.id AND l.student_id IS NOT NULL AND l.announcement_id IS NULL AND l.activity_id IS NULL ORDER BY l.id LIMIT 1) AS student_id FROM app.files f LEFT JOIN app.memberships m ON m.school_id=f.school_id AND m.user_id=f.uploaded_by WHERE f.school_id=$1 AND f.upload_class_id=$2 AND f.purpose='CLASS_DOCUMENT' ORDER BY f.created_at DESC,f.id LIMIT 1001`,[ctx.schoolId,ctx.classId])).rows;
 if(rows.length>1000)throw new Problem(422,'CLASS_FILES_LIMIT');
 const files=[];for(const row of rows){const student=row.student_id?await one<Row>(tx,'SELECT full_name FROM app.students WHERE school_id=$1 AND id=$2',[ctx.schoolId,row.student_id]):undefined;files.push({...fileDto(row),id:String(row.id),share:row.share,studentId:row.student_id??null,studentName:student?.full_name??null,ownerName:row.owner_name??null});}
 const students=(await tx.query<{id:string;full_name:string}>("SELECT s.id,s.full_name FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4) ORDER BY s.full_name COLLATE app.vi_names,s.id LIMIT 5001",[ctx.schoolId,ctx.classId,ctx.yearId,ctx.today])).rows;if(students.length>5000)throw new Problem(422,'CLASS_FILES_LIMIT');
 return {schoolId:ctx.schoolId,yearId:ctx.yearId,classId:ctx.classId,readOnly:ctx.readOnly,files,students:students.map(s=>({id:s.id,fullName:s.full_name}))};
}
export async function updateClassFile(tx:Transaction,policy:Permissions,c:RequestContext){
 const ctx=await activityWorkspaceAccess(tx,policy,c,'file.manage'),id=c.params.fileId!,file=await one<Row>(tx,"SELECT * FROM app.files WHERE school_id=$1 AND id=$2 AND upload_class_id=$3 AND purpose='CLASS_DOCUMENT' FOR UPDATE",[ctx.schoolId,id,ctx.classId]);if(!file)notFound();
 if(file.version!==c.body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(file.version));
 if(!['share','studentId','status'].some(key=>Object.hasOwn(c.body,key)))validation('form','Chọn thao tác cần cập nhật');
 if(!['READY','ARCHIVED'].includes(String(file.status)))throw new Problem(409,'FILE_UNAVAILABLE');
 if(file.expires_at&&new Date(file.expires_at as Date).getTime()<=Date.now())throw new Problem(409,'FILE_UNAVAILABLE');
 const links=(await tx.query<Row>('SELECT * FROM app.file_links WHERE school_id=$1 AND file_id=$2 AND announcement_id IS NULL AND activity_id IS NULL ORDER BY id',[ctx.schoolId,id])).rows;
 const oldShare=links.find(l=>l.share_with_guardian),share=String(c.body.share??(oldShare?oldShare.student_id?'student_parent':'class_parents':'internal'));
 const studentId=c.body.studentId??links.find(l=>l.student_id)?.student_id??null;
 if(share==='student_parent'){
  if(!studentId)validation('studentId','Chọn học sinh được chia sẻ');
  if(!await one(tx,"SELECT id FROM app.enrollments WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND student_id=$4 AND status<>'CANCELLED' AND starts_on<=$5 AND (ends_on IS NULL OR ends_on>$5)",[ctx.schoolId,ctx.classId,ctx.yearId,studentId,ctx.today]))validation('studentId','Học sinh không còn thuộc lớp');
 }
 if(share==='class_parents'&&String(file.content_type).startsWith('image/'))validation('share','Không chia sẻ ảnh học sinh cho cả lớp');
 const status=c.body.status==='archived'?'ARCHIVED':c.body.status==='active'?'READY':file.status;
 // Revoke existing grants before creating the exact next recipient set. Historical rows remain.
 await tx.query('UPDATE app.parent_document_items SET revoked_at=now() WHERE school_id=$1 AND file_id=$2 AND revoked_at IS NULL',[ctx.schoolId,id]);
 await tx.query('DELETE FROM app.file_links WHERE school_id=$1 AND file_id=$2 AND announcement_id IS NULL AND activity_id IS NULL',[ctx.schoolId,id]);
 const privateTarget=share==='student_parent'||share==='internal'&&!!studentId;
 await tx.query('INSERT INTO app.file_links(school_id,file_id,class_id,student_id,share_with_guardian) VALUES($1,$2,$3,$4,$5)',[ctx.schoolId,id,privateTarget?null:ctx.classId,privateTarget?studentId:null,share!=='internal']);
 await tx.query('UPDATE app.files SET status=$3 WHERE school_id=$1 AND id=$2',[ctx.schoolId,id,status]);
 if(status==='READY'&&share!=='internal'){
  const recipients=(await tx.query<{student_id:string}>("SELECT DISTINCT student_id FROM app.enrollments WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND status<>'CANCELLED' AND starts_on<=$4 AND (ends_on IS NULL OR ends_on>$4) AND ($5::uuid IS NULL OR student_id=$5)",[ctx.schoolId,ctx.classId,ctx.yearId,ctx.today,share==='student_parent'?studentId:null])).rows;
  if(!recipients.length)throw new Problem(422,'EMPTY_RECIPIENTS');
  for(const r of recipients)await tx.query('INSERT INTO app.parent_document_items(school_id,student_id,year_id,file_id,title,download_allowed,published_at) VALUES($1,$2,$3,$4,$5,true,now())',[ctx.schoolId,r.student_id,ctx.yearId,id,String(file.original_name).slice(0,200)]);
 }
 await audit(tx,c,'file',id,{status,share});const workspace=await classFilesWorkspace(tx,policy,c),saved=workspace.files.find(f=>f.id===id);if(!saved)notFound();return saved;
}
