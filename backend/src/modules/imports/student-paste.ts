import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {one,type Transaction,type Row} from '../../database/database';
import {Permissions} from '../../common/permissions';
import {Problem,validation} from '../../common/problem';
import {atomicStore,stagingPath,storageAvailable,removeStaging} from '../files/storage';
import type {RequestContext} from '../../api.router';

export const PASTE_FIELDS=['studentCode','fullName','dateOfBirth','gender','guardianName','guardianPhone','guardianEmail','relationshipLabel'] as const;
export const isStudentPaste=(job:Row)=>job.kind==='STUDENTS'&&(job.column_mapping as {source?:string}|undefined)?.source==='PASTE';
export async function createStudentPaste(tx:Transaction,policy:Permissions,c:RequestContext){
 const schoolId=c.params.schoolId!,classId=String(c.body.classId),yearId=String(c.body.yearId),rows=c.body.rows as Record<string,string>[];
 await tx.query('SELECT app.lock_school()');
 await policy.require(tx,c.principal!,'student.manage',{schoolId,classId});
 const cls=await one<Row>(tx,"SELECT c.*,y.starts_on,y.ends_on FROM app.classes c JOIN app.academic_years y ON y.school_id=c.school_id AND y.id=c.year_id WHERE c.school_id=$1 AND c.id=$2 AND c.year_id=$3 AND c.status<>'ARCHIVED' AND y.status<>'ARCHIVED'",[schoolId,classId,yearId]);
 if(!cls)validation('classId','Lớp không thuộc năm học đang chọn hoặc đã lưu trữ');
 const startsOn=String(c.body.startsOn);
 if(startsOn<String(cls.starts_on)||startsOn>=String(cls.ends_on))validation('startsOn','Ngày vào lớp phải nằm trong năm học');
 if(!Array.isArray(rows)||!rows.length||rows.length>500||Buffer.byteLength(JSON.stringify(rows),'utf8')>200*1024)validation('rows','Tối đa 500 học sinh và 200 KB; dùng Nhập từ tệp cho danh sách lớn hơn');
 if(rows.some(r=>PASTE_FIELDS.some(k=>r[k]!==undefined&&typeof r[k]!=='string')||Object.keys(r).some(k=>!PASTE_FIELDS.includes(k as typeof PASTE_FIELDS[number]))))validation('rows','Cột dán không hợp lệ');
 if(rows.some(r=>r.guardianName||r.guardianPhone||r.guardianEmail||r.relationshipLabel))await policy.require(tx,c.principal!,'guardian.manage',{schoolId,classId});
 const cell=(value:string)=>'"'+(/^[\s\u0000-\u001f]*[=+\-@]/.test(value)?"'"+value:value).replace(/"/g,'""')+'"';
 const bytes=Buffer.from([PASTE_FIELDS.join(','),...rows.map(r=>PASTE_FIELDS.map(k=>cell(r[k]??'')).join(','))].join('\r\n'),'utf8');
 const used=await one<{total:string}>(tx,'SELECT coalesce(sum(byte_size),0)::text AS total FROM app.files WHERE school_id=$1',[schoolId]);
 if(Number(used!.total)+bytes.length>Number(process.env.SCHOOL_FILE_QUOTA_MB??512)*1024*1024)throw new Problem(422,'FILE_QUOTA_EXCEEDED');
 await storageAvailable(bytes.length);const fileId=crypto.randomUUID(),key=fileId+'.ready',temporary=stagingPath(fileId);
 await fs.mkdir(path.dirname(temporary),{recursive:true,mode:0o700});
 await fs.writeFile(temporary,bytes,{flag:'wx',mode:0o600});
 try{await atomicStore(schoolId,key,temporary);}finally{await removeStaging(temporary);}
 await tx.query("INSERT INTO app.files(id,school_id,object_key,original_name,content_type,byte_size,sha256,status,uploaded_by,purpose,upload_class_id) VALUES($1,$2,$3,'Danh sách học sinh đã dán.csv','text/csv',$4,$5,'READY',$6,'IMPORT',$7)",[fileId,schoolId,key,bytes.length,crypto.createHash('sha256').update(bytes).digest('hex'),c.principal!.userId,classId]);
 const columns=[...PASTE_FIELDS,'startsOn'],mapping={source:'PASTE',mode:'ADD_ONLY',mapping:columns.map(k=>({sourceColumn:k,targetField:k}))};
 const job=await one<Row>(tx,"INSERT INTO app.import_jobs(school_id,kind,file_id,requested_by,year_id,class_id,status,source_columns,parsed_at,column_mapping,summary) VALUES($1,'STUDENTS',$2,$3,$4,$5,'VALIDATING',$6,now(),$7,$8) RETURNING *",[schoolId,fileId,c.principal!.userId,yearId,classId,JSON.stringify(columns),mapping,{added:0,updated:0,skipped:0,invalid:0,processed:0}]);
 for(let i=0;i<rows.length;i++)await tx.query('INSERT INTO app.import_rows(school_id,import_id,row_number,source_data) VALUES($1,$2,$3,$4)',[schoolId,job!.id,i+1,{...Object.fromEntries(PASTE_FIELDS.map(k=>[k,rows[i]![k]??''])),startsOn}]);
 return job!;
}
