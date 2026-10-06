import type {QueryClient} from '@tanstack/react-query';
import {STAFF_QUERY_DOMAIN} from '@/lib/api/query-boundary';

/** Include failed option reads: a successful create can resolve their missing dependency. */
export async function refreshFormOptions(client:QueryClient,schoolId:string){
 await client.invalidateQueries({queryKey:[STAFF_QUERY_DOMAIN],predicate:q=>q.queryKey.includes(schoolId)});
}

export function validPickerValue(value:string,options:readonly {id:string}[]){return !value||options.some(o=>o.id===value);}
export function pickerStatusAllowed(status:string,purpose:'assignment'|'runtime'){
 return purpose==='assignment'?['DRAFT','ACTIVE'].includes(status.toUpperCase()):status.toUpperCase()==='ACTIVE';
}
