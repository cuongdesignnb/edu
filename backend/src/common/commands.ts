import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Database,one,type Transaction } from '../database/database';
import { hashToken } from './security';
import { Problem } from './problem';
import type { RequestContext,Result } from '../api.router';
export function canonical(value:unknown):string {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,val])=>JSON.stringify(key)+':'+canonical(val)).join(',')+'}';
}
@Injectable()
export class Commands {
  constructor(private readonly db:Database){}
  async execute(c:RequestContext,authorize:(tx:Transaction)=>Promise<unknown>,work:(tx:Transaction)=>Promise<Result>,secretResult=false):Promise<Result>{
    const schoolId=c.params.schoolId!;
    const key=c.request.headers['idempotency-key'];
    if(typeof key!=='string'||key.length<16||key.length>128)throw new Problem(422,'IDEMPOTENCY_KEY_REQUIRED');
    const requestHash=hashToken(canonical({params:c.params,body:c.body,query:c.query}));
    return this.db.transaction(async tx=>{
      await tx.query('SELECT app.lock_school()');
      await authorize(tx); // Replayed commands must still have current permission.
      const inserted=await tx.query(`INSERT INTO app.idempotency_keys
        (school_id,actor_user_id,operation_id,key_hash,request_hash,expires_at)
        VALUES($1,$2,$3,$4,$5,now()+interval '24 hours')
        ON CONFLICT(school_id,actor_user_id,operation_id,key_hash) DO NOTHING RETURNING id`,
      [schoolId,c.principal!.userId,c.operation.id,hashToken(key),requestHash]);
      if(!inserted.rowCount){
        const existing=await one<{id:string;request_hash:string;status:string;response_metadata:Result;response_status:number}>(tx,
          `SELECT id,request_hash,status,response_metadata,response_status FROM app.idempotency_keys
           WHERE school_id=$1 AND actor_user_id=$2 AND operation_id=$3 AND key_hash=$4 FOR UPDATE`,
        [schoolId,c.principal!.userId,c.operation.id,hashToken(key)]);
        if(!existing||existing.request_hash!==requestHash)throw new Problem(409,'IDEMPOTENCY_CONFLICT');
        if(secretResult)throw new Problem(409,'LINK_ALREADY_ISSUED');
        if(existing.status!=='COMPLETED')throw new Problem(409,'IN_PROGRESS');
        return {...existing.response_metadata,status:existing.response_status};
      }
      const result=await work(tx);
      await tx.query(`UPDATE app.idempotency_keys SET status='COMPLETED',response_status=$5,response_metadata=$6
        WHERE school_id=$1 AND actor_user_id=$2 AND operation_id=$3 AND key_hash=$4`,
      [schoolId,c.principal!.userId,c.operation.id,hashToken(key),result.status??200,
        secretResult?{issued:true}:result]);
      return result;
    },{schoolId,userId:c.principal!.userId});
  }
}
export async function audit(tx:Transaction,c:RequestContext,targetType:string,targetId:string,metadata:Record<string,unknown>={}){
  await tx.query(`INSERT INTO app.audit_events(school_id,actor_user_id,actor_kind,action,target_type,target_id,request_id,reason,redacted_after)
    VALUES($1,$2,'STAFF',$3,$4,$5,$6,$7,$8)`,[c.params.schoolId,c.principal!.userId,c.operation.id,targetType,targetId,
    c.requestId,typeof c.body.reason==='string'?c.body.reason:null,metadata]);
}
export const newUuid=()=>crypto.randomUUID();
