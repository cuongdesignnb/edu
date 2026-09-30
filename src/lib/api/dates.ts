import {RepoError} from '../repositories/errors';

/** Date-only boundaries are independent of the browser's local timezone. */
export function dateDays(date:string,days:number):string{
  const value=new Date(`${date}T00:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(value.getTime())||value.toISOString().slice(0,10)!==date)throw new RepoError('VALIDATION','Ngày chưa hợp lệ.');
  value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);
}
export const inclusiveDate=(exclusive:string)=>dateDays(exclusive,-1);
export const exclusiveDate=(inclusive:string)=>dateDays(inclusive,1);
