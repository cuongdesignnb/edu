import {RepoError,isRepoError} from '../errors';

/** Preserve the existing form's field names while using the server request DTO. */
export async function formResult<T>(work:Promise<T>,names:Record<string,string>):Promise<T>{
  try{return await work;}catch(error){
    if(!isRepoError(error)||!error.fieldErrors)throw error;
    const fields=Object.fromEntries(Object.entries(error.fieldErrors).map(([key,message])=>{
      const [head,...tail]=key.split('.');return [[names[head]??head,...tail].join('.'),message];
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
