import type { Transaction,Row } from './database';
import { iso,one } from './database';
import { Problem,notFound } from '../common/problem';
import { canonical } from '../common/commands';
import { runtimeConfig } from '../common/config';
import { equal } from '../common/security';
import crypto from 'node:crypto';

export interface Resource {
  table:string;fields:Record<string,string>;writeFields:string[];search:string[];filters:Record<string,string>;
}
const meta={id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at'};
export const resources:Record<string,Resource>={
  year:{table:'app.academic_years',fields:{...meta,code:'code',name:'name',startsOn:'starts_on',endsOn:'ends_on',status:'status'},writeFields:['code','name','startsOn','endsOn'],search:['code','name'],filters:{status:'status'}},
  term:{table:'app.terms',fields:{...meta,yearId:'year_id',code:'code',name:'name',startsOn:'starts_on',endsOn:'ends_on'},writeFields:['yearId','code','name','startsOn','endsOn'],search:['code','name'],filters:{yearId:'year_id'}},
  week:{table:'app.school_weeks',fields:{...meta,yearId:'year_id',termId:'term_id',weekNumber:'week_number',startsOn:'starts_on',endsOn:'ends_on',inputDeadline:'input_deadline'},writeFields:['yearId','termId','weekNumber','startsOn','endsOn','inputDeadline'],search:[],filters:{yearId:'year_id',termId:'term_id'}},
  calendar:{table:'app.calendar_events',fields:{...meta,yearId:'year_id',classId:'class_id',title:'title',kind:'kind',startsOn:'starts_on',endsOn:'ends_on',status:'status'},writeFields:['yearId','classId','title','kind','startsOn','endsOn'],search:['title'],filters:{yearId:'year_id',classId:'class_id',status:'status'}},
  class:{table:'app.classes',fields:{...meta,yearId:'year_id',gradeLevelId:'grade_level_id',code:'code',name:'name',capacity:'capacity',status:'status'},writeFields:['yearId','gradeLevelId','code','name','capacity'],search:['code','name'],filters:{yearId:'year_id',gradeLevelId:'grade_level_id',status:'status'}},
  student:{table:'app.students',fields:{...meta,studentCode:'student_code',fullName:'full_name',preferredName:'preferred_name',dateOfBirth:'date_of_birth',status:'status'},writeFields:['studentCode','fullName','preferredName','dateOfBirth'],search:['student_code','full_name'],filters:{status:'status'}},
  enrollment:{table:'app.enrollments',fields:{...meta,studentId:'student_id',classId:'class_id',yearId:'year_id',startsOn:'starts_on',endsOn:'ends_on',status:'status'},writeFields:['studentId','classId','yearId','startsOn','endsOn'],search:[],filters:{studentId:'student_id',classId:'class_id',yearId:'year_id',status:'status'}},
  guardian:{table:'app.guardians',fields:{...meta,fullName:'full_name',phone:'phone',email:'email',status:'status'},writeFields:['fullName','phone','email'],search:['full_name'],filters:{status:'status'}},
  relationship:{table:'app.guardian_relationships',fields:{...meta,studentId:'student_id',guardianId:'guardian_id',relationshipLabel:'relationship_label',isPrimary:'is_primary',canReceiveInfo:'can_receive_info',status:'status',verifiedAt:'verified_at'},writeFields:['studentId','guardianId','relationshipLabel','isPrimary'],search:[],filters:{studentId:'student_id',guardianId:'guardian_id',status:'status'}},
  member:{table:'app.memberships',fields:{...meta,userId:'user_id',staffCode:'staff_code',workDisplayName:'work_display_name',workEmail:'work_email',workPhone:'work_phone',shareWorkContact:'share_work_contact',department:'department',status:'status'},writeFields:['workDisplayName','workEmail','workPhone','shareWorkContact','department'],search:['work_display_name','staff_code'],filters:{status:'status'}},
  grade:{table:'app.grade_levels',fields:{...meta,code:'code',name:'name',sortOrder:'sort_order',status:'status'},writeFields:['code','name','sortOrder'],search:['code','name'],filters:{status:'status'}},
  subject:{table:'app.subjects',fields:{...meta,code:'code',name:'name',status:'status'},writeFields:['code','name'],search:['code','name'],filters:{status:'status'}},
  room:{table:'app.rooms',fields:{...meta,code:'code',name:'name',capacity:'capacity',status:'status'},writeFields:['code','name','capacity'],search:['code','name'],filters:{status:'status'}},
};
export function resource(name:string){const value=resources[name];if(!value)throw new Error('Unknown configured resource');return value;}
export function columns(r:Resource,alias='t') {return [...new Set(Object.values(r.fields))].map(column=>`${alias}.${column}`).join(',');}
export function dto(r:Resource,row:Row):Record<string,unknown> {
  const value:Record<string,unknown>={};
  for(const [field,column] of Object.entries(r.fields))if(row[column]!==undefined){
    // Optional UUID properties are omitted instead of producing invalid null UUIDs.
    if(row[column]===null&&field.endsWith('Id'))continue;
    if(row[column]===null&&field==='capacity')continue;
    value[field]=row[column] instanceof Date?iso(row[column] as Date):row[column];
  }
  return value;
}
export async function getResource(tx:Transaction,r:Resource,schoolId:string,id:string,lock=false){
  const row=await one<Row>(tx,`SELECT ${columns(r)} FROM ${r.table} t WHERE t.school_id=$1 AND t.id=$2${lock?' FOR UPDATE':''}`,[schoolId,id]);
  if(!row)notFound();return row;
}
export async function insertResource(tx:Transaction,r:Resource,schoolId:string,body:Record<string,unknown>,extra:Record<string,unknown>={}){
  const values:unknown[]=[schoolId],names=['school_id'];
  for(const field of r.writeFields)if(Object.hasOwn(body,field)){names.push(r.fields[field]!);values.push(body[field]);}
  for(const [column,value] of Object.entries(extra)){names.push(column);values.push(value);}
  const row=await one<Row>(tx,`INSERT INTO ${r.table} (${names.join(',')}) VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,values);
  return dto(r,row!);
}
export async function updateResource(tx:Transaction,r:Resource,schoolId:string,id:string,body:Record<string,unknown>,extra:Record<string,unknown>={}){
  const current=await getResource(tx,r,schoolId,id,true);
  if(current.version!==body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(current.version));
  const values:unknown[]=[schoolId,id,body.expectedVersion],changes:string[]=[];
  for(const field of r.writeFields)if(Object.hasOwn(body,field)){values.push(body[field]);changes.push(`${r.fields[field]}=$${values.length}`);}
  for(const [column,value] of Object.entries(extra)){values.push(value);changes.push(`${column}=$${values.length}`);}
  if(!changes.length)return dto(r,current);
  const row=await one<Row>(tx,`UPDATE ${r.table} SET ${changes.join(',')} WHERE school_id=$1 AND id=$2 AND version=$3 RETURNING *`,values);
  if(!row)throw new Problem(409,'VERSION_CONFLICT');return dto(r,row);
}
export interface Predicate {sql:string;values:unknown[]}
function cursorSign(text:string){return crypto.createHmac('sha256',runtimeConfig().key).update('cursor:'+text).digest('base64url');}
export async function listResource(tx:Transaction,r:Resource,schoolId:string|null,query:Record<string,string>,
  extra:Predicate={sql:'',values:[]},principalId='',baseParameters:unknown[]=[]){
  const limit=Number(query.limit??25);
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new Problem(422,'INVALID_LIMIT');
  const sort=query.sort??'id',sortColumn=r.fields[sort];
  if(!sortColumn||['phone','email','workPhone','workEmail'].includes(sort))throw new Problem(422,'INVALID_SORT');
  const direction=query.dir??'asc';if(!['asc','desc'].includes(direction))throw new Problem(422,'INVALID_SORT');
  const values:unknown[]=[schoolId,...baseParameters],where=[schoolId===null?'$1::uuid IS NULL':'t.school_id=$1'];
  for(const [field,column] of Object.entries(r.filters))if(query[field]){values.push(query[field]);where.push(`t.${column}=$${values.length}`);}
  if(query.q){
    if(query.q.length>200)throw new Problem(422,'INVALID_SEARCH');
    if(r.search.length){values.push('%'+query.q.replace(/[\\%_]/g,'\\$&')+'%');where.push('('+r.search.map(column=>`t.${column} ILIKE $${values.length}`).join(' OR ')+')');}
  }
  if(extra.sql){
    const offset=values.length;values.push(...extra.values);
    where.push('('+extra.sql.replace(/\$(\d+)/g,(_,i)=>'$'+(Number(i)+offset))+')');
  }
  const fingerprint=crypto.createHash('sha256').update(canonical({schoolId,principalId,table:r.table,
    query:{...query,cursor:undefined},extra,baseParameters})).digest('hex');
  const count=(await one<{total:string}>(tx,`SELECT count(*) AS total FROM ${r.table} t WHERE ${where.join(' AND ')}`,values))!.total;
  if(query.cursor){
    const [payload,signature]=query.cursor.split('.');
    if(!payload||!signature||!equal(signature,cursorSign(payload)))throw new Problem(422,'INVALID_CURSOR');
    let cursor:{fingerprint:string;sortValue:unknown;id:string};
    try{cursor=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as typeof cursor;}catch{throw new Problem(422,'INVALID_CURSOR');}
    if(cursor.fingerprint!==fingerprint||typeof cursor.id!=='string')throw new Problem(422,'INVALID_CURSOR');
    values.push(cursor.sortValue,cursor.id);where.push(`(t.${sortColumn},t.id) ${direction==='asc'?'>':'<'} ($${values.length-1},$${values.length})`);
  }
  values.push(limit+1);
  const rows=(await tx.query<Row>(`SELECT ${columns(r)} FROM ${r.table} t WHERE ${where.join(' AND ')}
    ORDER BY t.${sortColumn} ${direction},t.id ${direction} LIMIT $${values.length}`,values)).rows;
  const hasMore=rows.length>limit;if(hasMore)rows.pop();const last=rows.at(-1);
  const payload=hasMore&&last?Buffer.from(JSON.stringify({fingerprint,sortValue:last[sortColumn],id:last.id})).toString('base64url'):null;
  return {data:rows.map(row=>dto(r,row)),page:{limit,hasMore,nextCursor:payload?`${payload}.${cursorSign(payload)}`:null,total:Number(count)}};
}
