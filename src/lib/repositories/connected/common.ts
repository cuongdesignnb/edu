import {RepoError,isRepoError} from '../errors';
import {captureStaffAccess} from '../../api/client';

/** Keep a composite result within one staff identity/scope, including its error callback. */
export function withStaffAccess<T extends Record<string,(...args:never[])=>Promise<unknown>>>(repository:T):T{
  return Object.fromEntries(Object.entries(repository).map(([name,method])=>[name,async(...args:never[])=>{
    const access=captureStaffAccess();
    try{const value=await method.apply(repository,args);access.assertCurrent();return value;}
    catch(error){access.assertCurrent();throw error;}
  }])) as T;
}

/** Preserve the existing form's field names while using the server request DTO. */
export async function formResult<T>(work:Promise<T>,names:Record<string,string>):Promise<T>{
  try{return await work;}catch(error){
    if(!isRepoError(error)||!error.fieldErrors)throw error;
    const fields=Object.fromEntries(Object.entries(error.fieldErrors).map(([key,message])=>{
      const [head,...tail]=key.split('.');return [names[key]??[names[head]??head,...tail].join('.'),message];
    }));
    throw new RepoError(error.code,error.message,{details:error.details,fieldErrors:fields});
  }
}
export function requiredId(value:string|null|undefined):string{
  if(!value)throw new RepoError('READ_ERROR','Phản hồi API thiếu mã đối tượng.');return value;
}
export function requiredValue<T>(value:T|undefined,field:string):T{
  if(value===undefined)throw new RepoError('READ_ERROR',`Phản hồi API thiếu trường ${field}.`);return value;
}
export function displayedVersion(value:number|undefined){
  if(!Number.isInteger(value)||value!<1)throw new RepoError('CONFLICT','Hãy tải lại dữ liệu trước khi sửa để giữ đúng phiên bản.',{details:{requiresReload:true}});return value!;
}
export function commandReason(value:string|undefined){
  if(!value||value.trim().length<3)throw new RepoError('VALIDATION','Hãy nhập lý do ít nhất 3 ký tự.',{fieldErrors:{reason:'Nhập lý do ít nhất 3 ký tự.'}});return value.trim();
}
