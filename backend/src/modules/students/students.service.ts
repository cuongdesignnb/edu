import { Injectable } from '@nestjs/common';
import { Database,one,type Transaction,type Row } from '../../database/database';
import { resource,dto,getResource,insertResource,updateResource,listResource,type Predicate } from '../../database/resources';
import { Permissions,grantAllows,type Grant } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { Problem,validation,notFound } from '../../common/problem';
import { placeEnrollment } from './enrollment';
import {studentForm,nextStudentCode} from './student-form';
import type { RequestContext,Result,Handler } from '../../api.router';

@Injectable()
export class StudentsService {
  constructor(private readonly db:Database,private readonly permissions:Permissions,private readonly commands:Commands){}
  handlers():Record<string,Handler>{
    const handlers:Record<string,Handler>={};
    for(const id of ['listStudents','getStudent','getClassStudent','listClassStudents','createStudent','updateStudent',
      'listStudentEnrollments','createEnrollment','listGuardians','createGuardian','getGuardian','updateGuardian',
      'listRelationships','createRelationship','verifyRelationship','revokeRelationship'])handlers[id]=c=>this.handle(c);
    return handlers;
  }
  private async studentScope(tx:Transaction,c:RequestContext,studentId:string,action:string){
    const schoolId=c.params.schoolId!;
    const access=await this.permissions.collection(tx,c.principal!,action,schoolId,action==='student.read');
    const values:unknown[]=[schoolId,studentId,access.today];
    let predicate='';
    if(!access.all){values.push(access.classIds);predicate+=` AND class_id=ANY($${values.length}::uuid[])`;}
    const classId=c.params.classId??c.query.classId;
    if(classId){values.push(classId);predicate+=` AND class_id=$${values.length}`;}
    if(c.query.yearId){values.push(c.query.yearId);predicate+=` AND year_id=$${values.length}`;}
    const enrollments=(await tx.query<Row>(`SELECT id,class_id,year_id,starts_on,ends_on FROM app.enrollments
      WHERE school_id=$1 AND student_id=$2 AND status<>'CANCELLED' AND starts_on<=$3
      AND (ends_on IS NULL OR ends_on>$3)${predicate} ORDER BY starts_on DESC,id`,values)).rows;
    if(!access.all&&!enrollments.length)notFound();
    if(classId&&!enrollments.length)notFound();
    await getResource(tx,resource('student'),schoolId,studentId);
    return {...access,enrollments};
  }
  private enrollmentPredicate(access:{all:boolean;classIds:string[];today:string},query:Record<string,string>,studentAlias='t'):Predicate{
    const values:unknown[]=[access.today];let sql=`EXISTS(SELECT 1 FROM app.enrollments e WHERE e.school_id=${studentAlias}.school_id
      AND e.student_id=${studentAlias}.id AND e.status<>'CANCELLED' AND e.starts_on<=$1 AND (e.ends_on IS NULL OR e.ends_on>$1)`;
    if(!access.all){values.push(access.classIds);sql+=` AND e.class_id=ANY($${values.length}::uuid[])`;}
    if(query.classId){values.push(query.classId);sql+=` AND e.class_id=$${values.length}`;}
    if(query.yearId){values.push(query.yearId);sql+=` AND e.year_id=$${values.length}`;}
    return {sql:sql+')',values};
  }
  private async handle(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!,operation=c.operation.id,studentId=c.params.studentId??String(c.body.studentId??'');
    const write=c.operation.method!=='GET';
    const authorize=async(tx:Transaction)=>{
      if(operation==='createStudent'){
        const access=await this.permissions.require(tx,c.principal!,c.operation.permission,{schoolId,classId:c.body.initialClassId as string|undefined,date:c.body.startsOn as string|undefined});
        if(c.body.initialGuardian)await this.permissions.require(tx,c.principal!,'guardian.manage',{schoolId,classId:c.body.initialClassId as string|undefined});
        return access;
      }
      if(operation==='createGuardian')return this.permissions.require(tx,c.principal!,c.operation.permission,{schoolId,classId:c.query.classId});
      if(operation==='listStudents'||operation==='listClassStudents'){
        const classId=c.params.classId??c.query.classId;
        if(classId)await this.permissions.require(tx,c.principal!,'student.read',{schoolId,classId,yearId:c.query.yearId,allowSubject:true});
        return this.permissions.collection(tx,c.principal!,'student.read',schoolId,true);
      }
      if(['getStudent','getClassStudent','listStudentEnrollments','updateStudent','createEnrollment','createRelationship'].includes(operation)){
        const access=await this.studentScope(tx,c,studentId,c.operation.permission);
        if(operation==='updateStudent'&&Object.hasOwn(c.body,'internalNote')&&!this.privateProfile(c,access))throw new Problem(403,'FORBIDDEN');
        return access;
      }
      if(['listGuardians','listRelationships'].includes(operation))return this.permissions.collection(tx,c.principal!,c.operation.permission,schoolId);
      if(['getGuardian','updateGuardian'].includes(operation))return this.guardianScope(tx,c,c.params.guardianId!);
      if(['verifyRelationship','revokeRelationship'].includes(operation)){
        const rel=await getResource(tx,resource('relationship'),schoolId,c.params.relationshipId!);
        return this.studentScope(tx,c,String(rel.student_id),c.operation.permission);
      }
      return this.permissions.require(tx,c.principal!,c.operation.permission,{schoolId});
    };
    const work=async(tx:Transaction):Promise<Result>=>{
      const access=await authorize(tx);
      if(operation==='listStudents'||operation==='listClassStudents'){
        const allowed=access as unknown as {all:boolean;classIds:string[];today:string};
        const query={...c.query,...(c.params.classId?{classId:c.params.classId}:{})};
        const result=await listResource(tx,resource('student'),schoolId,query,this.enrollmentPredicate(allowed,query),c.principal!.userId);
        // Birth dates are not part of the subject teacher roster. Detailed profiles
        // can add them only after checking the guardian/class field policy.
        if(!allowed.all)for(const row of result.data){delete row.dateOfBirth;delete row.preferredName;}
        return result;
      }
      if(operation==='getStudent'||operation==='getClassStudent')return {data:await this.detail(tx,c,studentId,access as unknown as {all:boolean;classIds:string[];today:string;grants:Grant[];enrollments:Row[]})};
      if(operation==='listStudentEnrollments'){
        const allowed=access as unknown as {all:boolean;classIds:string[]};
        return listResource(tx,resource('enrollment'),schoolId,{...c.query,studentId},allowed.all?undefined:
          {sql:'t.class_id=ANY($1::uuid[])',values:[allowed.classIds]},c.principal!.userId);
      }
      if(operation==='createStudent'){
        await tx.query('SELECT id FROM platform.schools WHERE id=$1 FOR UPDATE',[schoolId]);
        const body=studentForm(c.body,access.today),guardian=body.initialGuardian as Record<string,unknown>|undefined;
        if(guardian)await this.permissions.require(tx,c.principal!,'guardian.manage',{schoolId,classId:body.initialClassId as string|undefined});
        if(body.studentCode===undefined)body.studentCode=await nextStudentCode(tx,schoolId,access.today);
        const data=await insertResource(tx,resource('student'),schoolId,body);
        if(c.body.initialClassId){
          if(!c.body.startsOn)validation('startsOn','Cần ngày bắt đầu theo học');
          data.initialEnrollment=await this.enroll(tx,c,String(data.id),String(c.body.initialClassId),String(c.body.startsOn));
        }
        if(guardian){
          const name=String(guardian.fullName).trim().replace(/\s+/g,' '),relation=String(guardian.relationshipLabel).trim();
          if(!name)validation('initialGuardian.fullName','Nhập tên người giám hộ');if(!relation)validation('initialGuardian.relationshipLabel','Nhập quan hệ giám hộ');
          if(typeof guardian.phone==='string'&&!/^[+\d ().*-]{8,32}$/.test(guardian.phone.trim()))validation('initialGuardian.phone','Điện thoại không hợp lệ');
          const contact=await insertResource(tx,resource('guardian'),schoolId,{...guardian,fullName:name,...(typeof guardian.phone==='string'?{phone:guardian.phone.trim()}:{})});
          const relationship=await insertResource(tx,resource('relationship'),schoolId,{studentId:data.id,guardianId:contact.id,relationshipLabel:relation,isPrimary:true},{status:'UNVERIFIED',can_receive_info:false});
          data.initialGuardian=contact;data.initialRelationship=relationship;
          await audit(tx,c,'guardian',String(contact.id));await audit(tx,c,'relationship',String(relationship.id),{status:'UNVERIFIED'});
        }
        await audit(tx,c,'student',String(data.id));return {data,status:201};
      }
      if(operation==='updateStudent'){
        const allowed=access as unknown as {all:boolean;classIds:string[];today:string;grants:Grant[];enrollments:Row[]},body=studentForm(c.body,allowed.today);
        if(Object.hasOwn(body,'internalNote')&&!this.privateProfile(c,allowed))throw new Problem(403,'FORBIDDEN');
        const data=await updateResource(tx,resource('student'),schoolId,studentId,body,Object.hasOwn(body,'internalNote')?{internal_note:body.internalNote}:{});
        if(Object.hasOwn(body,'internalNote'))data.internalNote=(await one<{internal_note:string|null}>(tx,'SELECT internal_note FROM app.students WHERE school_id=$1 AND id=$2',[schoolId,studentId]))!.internal_note;
        await audit(tx,c,'student',studentId,{version:data.version});return {data};
      }
      if(operation==='createEnrollment'){
        const data=await this.enroll(tx,c,studentId,String(c.body.classId),String(c.body.startsOn));
        await audit(tx,c,'enrollment',String(data.id));return {data,status:201};
      }
      if(operation==='listGuardians'||operation==='listRelationships'){
        const allowed=access as unknown as {all:boolean;classIds:string[];today:string};
        const kind=operation==='listGuardians'?'guardian':'relationship';
        let predicate:Predicate|undefined;
        if(!allowed.all){
          const studentJoin=kind==='guardian'?'JOIN app.guardian_relationships gr ON gr.school_id=e.school_id AND gr.student_id=e.student_id':'';
          const target=kind==='guardian'?'gr.guardian_id=t.id':'e.student_id=t.student_id';
          predicate={sql:`EXISTS(SELECT 1 FROM app.enrollments e ${studentJoin} WHERE e.school_id=t.school_id AND ${target}
            AND e.status<>'CANCELLED' AND e.starts_on<=$1 AND (e.ends_on IS NULL OR e.ends_on>$1) AND e.class_id=ANY($2::uuid[]))`,values:[allowed.today,allowed.classIds]};
        }
        return listResource(tx,resource(kind),schoolId,c.query,predicate,c.principal!.userId);
      }
      if(operation==='getGuardian')return {data:dto(resource('guardian'),await getResource(tx,resource('guardian'),schoolId,c.params.guardianId!))};
      if(operation==='createGuardian'){
        const data=await insertResource(tx,resource('guardian'),schoolId,c.body);await audit(tx,c,'guardian',String(data.id));return {data,status:201};
      }
      if(operation==='updateGuardian'){
        const data=await updateResource(tx,resource('guardian'),schoolId,c.params.guardianId!,c.body);await audit(tx,c,'guardian',String(data.id),{version:data.version});return {data};
      }
      if(operation==='createRelationship'){
        await getResource(tx,resource('guardian'),schoolId,String(c.body.guardianId));
        // A class manager cannot attach an unrelated family's known UUID to
        // their student to acquire that family's contact information.
        const allowed=await this.permissions.collection(tx,c.principal!,'guardian.manage',schoolId);
        if(!allowed.all){
          const fresh=await one(tx,`SELECT a.id FROM app.audit_events a WHERE a.school_id=$1 AND a.actor_user_id=$2
            AND a.action='createGuardian' AND a.target_id=$3 AND NOT EXISTS
            (SELECT 1 FROM app.guardian_relationships gr WHERE gr.school_id=$1 AND gr.guardian_id=$3) LIMIT 1`,
          [schoolId,c.principal!.userId,c.body.guardianId]);
          if(!fresh)await this.guardianScope(tx,c,String(c.body.guardianId));
        }
        const data=await insertResource(tx,resource('relationship'),schoolId,c.body,{can_receive_info:false});
        await audit(tx,c,'relationship',String(data.id));return {data,status:201};
      }
      const id=c.params.relationshipId!,rel=await getResource(tx,resource('relationship'),schoolId,id,true);
      const revoke=operation==='revokeRelationship';
      const data=await updateResource(tx,resource('relationship'),schoolId,id,{expectedVersion:c.body.expectedVersion},revoke?
        {status:'REVOKED',can_receive_info:false,revoked_at:new Date()}:
        {status:'VERIFIED',can_receive_info:c.body.canReceiveInfo,verified_by:c.principal!.userId,verified_at:new Date(),revoked_at:null});
      if(revoke||c.body.canReceiveInfo===false){
        await tx.query(`UPDATE app.parent_access_links SET revoked_at=now(),revoke_reason='RELATIONSHIP_REVOKED'
          WHERE school_id=$1 AND relationship_id=$2 AND revoked_at IS NULL`,[schoolId,id]);
        await tx.query(`UPDATE identity.parent_sessions SET revoked_at=now() WHERE school_id=$1 AND access_link_id IN
          (SELECT id FROM app.parent_access_links WHERE school_id=$1 AND relationship_id=$2) AND revoked_at IS NULL`,[schoolId,id]);
      }
      await audit(tx,c,'relationship',id,{status:data.status,studentId:rel.student_id,
        ...(typeof c.body.verificationNote==='string'?{verificationNote:c.body.verificationNote}:{})});return {data};
    };
    if(!write)return this.db.transaction(work,{schoolId});
    // Commands reserves idempotency before any mutation. work rechecks current
    // target scope within the same transaction as references and locks.
    return this.commands.execute(c,authorize,work);
  }
  private async guardianScope(tx:Transaction,c:RequestContext,guardianId:string){
    const schoolId=c.params.schoolId!;
    const access=await this.permissions.collection(tx,c.principal!,c.operation.permission,schoolId);
    await getResource(tx,resource('guardian'),schoolId,guardianId);
    if(!access.all){
      const related=(await tx.query(`SELECT gr.id FROM app.guardian_relationships gr JOIN app.enrollments e
        ON e.school_id=gr.school_id AND e.student_id=gr.student_id WHERE gr.school_id=$1 AND gr.guardian_id=$2
        AND e.class_id=ANY($3::uuid[]) AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4) LIMIT 1`,
      [schoolId,guardianId,access.classIds,access.today])).rowCount;
      if(!related)notFound();
    }
    return access;
  }
  private async detail(tx:Transaction,c:RequestContext,studentId:string,access:{all:boolean;classIds:string[];today:string;grants:Grant[];enrollments:Row[]}){
    const schoolId=c.params.schoolId!,student=await getResource(tx,resource('student'),schoolId,studentId);
    const full=this.privateProfile(c,access);
    const studentDto=dto(resource('student'),student);if(!full){delete studentDto.dateOfBirth;delete studentDto.preferredName;}
    const values:unknown[]=[schoolId,studentId];let predicate='';
    if(!access.all){values.push(access.classIds);predicate=` AND class_id=ANY($${values.length}::uuid[])`;}
    const enrollments=(await tx.query<Row>(`SELECT * FROM app.enrollments WHERE school_id=$1 AND student_id=$2${predicate} ORDER BY starts_on,id`,values)).rows;
    const data:Record<string,unknown>={student:studentDto,enrollments:enrollments.map(row=>dto(resource('enrollment'),row))};
    if(full){
      const rels=(await tx.query<Row>('SELECT * FROM app.guardian_relationships WHERE school_id=$1 AND student_id=$2',[schoolId,studentId])).rows;
      const guardians=(await tx.query<Row>(`SELECT g.* FROM app.guardians g WHERE g.school_id=$1 AND g.id IN
        (SELECT guardian_id FROM app.guardian_relationships WHERE school_id=$1 AND student_id=$2)`,[schoolId,studentId])).rows;
      data.relationships=rels.map(row=>dto(resource('relationship'),row));data.guardians=guardians.map(row=>dto(resource('guardian'),row));
      const note=await one<{internal_note:string|null}>(tx,'SELECT internal_note FROM app.students WHERE school_id=$1 AND id=$2',[schoolId,studentId]);
      data.internalNote=note?.internal_note??null;
    }
    return data;
  }
  private privateProfile(c:RequestContext,access:{today:string;grants:Grant[];enrollments:Row[]}){
    const schoolId=c.params.schoolId!;return access.grants.some(grant=>grant.scope_type==='SCHOOL'&&grant.actions.includes('guardian.read'))||access.enrollments.some(enrollment=>
      access.grants.some(grant=>grantAllows(grant,'guardian.read',{schoolId,classId:String(enrollment.class_id)},access.today)));
  }
  private async enroll(tx:Transaction,c:RequestContext,studentId:string,classId:string,startsOn:string){
    const schoolId=c.params.schoolId!;
    await this.permissions.require(tx,c.principal!,'student.manage',{schoolId,classId,date:startsOn});
    await tx.query('SELECT id FROM platform.schools WHERE id=$1 FOR UPDATE',[schoolId]);
    return placeEnrollment(tx,schoolId,studentId,classId,startsOn);
  }
}
